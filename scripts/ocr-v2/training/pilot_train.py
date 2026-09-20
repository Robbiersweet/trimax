"""Isolated WSL pilot: explicit splits, resumable features, validation-only selection."""
import argparse
import concurrent.futures
import hashlib
import json
import os
import random
import shutil
import subprocess
import time
from pathlib import Path

from PIL import Image, ImageFilter

ENV = dict(os.environ, OMP_THREAD_LIMIT='1')


def edits(expected, observed):
    d = [[0]*(len(observed)+1) for _ in range(len(expected)+1)]
    for i in range(len(expected)+1): d[i][0] = i
    for j in range(len(observed)+1): d[0][j] = j
    for i in range(1, len(expected)+1):
        for j in range(1, len(observed)+1):
            d[i][j] = min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+(expected[i-1] != observed[j-1]))
    i, j, sub, ins, delete = len(expected), len(observed), 0, 0, 0
    while i or j:
        if i and j and d[i][j] == d[i-1][j-1]+(expected[i-1] != observed[j-1]):
            sub += expected[i-1] != observed[j-1]; i -= 1; j -= 1
        elif j and d[i][j] == d[i][j-1]+1:
            ins += 1; j -= 1
        else:
            delete += 1; i -= 1
    return {'substitutions':sub, 'insertions':ins, 'deletions':delete,
            'distance':sub+ins+delete, 'characters':len(expected)}


def run(args, log=None):
    p = subprocess.run([str(x) for x in args], env=ENV, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if log: Path(log).write_text(p.stdout)
    if p.returncode: raise RuntimeError(p.stdout[-4000:])
    return p.stdout


def recognize(row, model):
    start = time.monotonic()
    p = subprocess.run(['tesseract', row['file'], 'stdout', '--tessdata-dir', str(model.parent),
                        '-l', model.stem, '--psm', '7', '--dpi', '300'], env=ENV, text=True, capture_output=True)
    if p.returncode: raise RuntimeError(p.stderr)
    raw = p.stdout.strip()
    # Case/space cleanup only, never separator insertion or digit correction.
    observed = ''.join(raw.upper().split())
    return {**row, 'raw':raw, 'observed':observed, 'exact':observed == row['label'],
            **edits(row['label'], observed), 'ms':(time.monotonic()-start)*1000}


def evaluate(rows, model, output):
    start = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda r: recognize(r, model), rows))
    groups = {}
    for kind in ['all', 'synthetic', 'real']:
        part = [r for r in results if kind == 'all' or r['kind'] == kind]
        chars = sum(r['characters'] for r in part)
        groups[kind] = {'count':len(part), 'exact':sum(r['exact'] for r in part),
                        'exactAccuracy':sum(r['exact'] for r in part)/len(part) if part else None,
                        'cer':sum(r['distance'] for r in part)/chars if chars else None}
    report = {'model':str(model), 'sha256':hashlib.sha256(model.read_bytes()).hexdigest(),
              'metrics':groups, 'durationSeconds':time.monotonic()-start, 'rows':results}
    Path(output).write_text(json.dumps(report, indent=2))
    print(json.dumps({'evaluation':model.name, 'metrics':groups}), flush=True)
    return report


def import_real(root, harvest):
    dest = root/'real'
    dest.mkdir(exist_ok=True)
    records = json.loads((harvest/'reviewed-crops.json').read_text())
    rows = []
    for r in records:
        if r['split'] not in ('train', 'validation'): continue
        assert r['documentId'] != 'B' and not r.get('protectedFixture')
        assert not any(n in r['label'] for n in ('0513', '0514', '0515', '0518', '0519'))
        source = harvest/'optics'/r['documentId']/Path(r['file'].replace('\\', '/')).name
        assert hashlib.sha256(source.read_bytes()).hexdigest() == r['sha256']
        rng = random.Random(r['id'])
        for j in range(40 if r['split'] == 'train' else 1):
            im = Image.open(source).convert('L')
            if j:
                im = im.resize((round(im.width*rng.uniform(.85, 1.1)), round(im.height*rng.uniform(.9, 1.1))), Image.Resampling.BICUBIC)
                im = im.filter(ImageFilter.GaussianBlur(rng.uniform(0, .5)))
                im = im.rotate(rng.uniform(-.5, .5), Image.Resampling.BICUBIC, fillcolor=255)
            stem = dest/(r['id']+f'-{j:02d}')
            im.save(stem.with_suffix('.png'))
            stem.with_suffix('.gt.txt').write_text(r['label']+'\n')
            stem.with_suffix('.box').write_text(''.join(f'{c} 0 0 {im.width} {im.height} 0\n' for c in r['label']+'\t'))
            rows.append({**r, 'kind':'real', 'file':str(stem.with_suffix('.png')), 'augmentation':j,
                         'parentSha256':r['sha256']})
    return rows


def feature(row, base):
    image = Path(row['file']); stem = image.with_suffix(''); output = stem.with_suffix('.lstmf')
    if not output.exists():
        run(['tesseract', image, stem, '--tessdata-dir', base.parent, '-l', 'eng', '--psm', '7', '/usr/share/tesseract-ocr/5/tessdata/configs/lstm.train'], stem.with_suffix('.feature.log'))
    if not output.exists():
        run(['tesseract', image, stem, '--tessdata-dir', base.parent, '-l', 'eng', '--psm', '13', '/usr/share/tesseract-ocr/5/tessdata/configs/lstm.train'], stem.with_suffix('.feature-fallback.log'))
    assert output.stat().st_size > 0
    return str(output)


def main(root, harvest):
    root = root.resolve()
    if root.is_relative_to(Path(__file__).resolve().parents[3]):
        raise ValueError('Private models and data must remain outside repository')
    if (root/'holdout-started.json').exists():
        raise ValueError('Pilot sealed: no training after holdout evaluation')
    corpus = root/'corpus-final'; base = root/'base/eng.traineddata'
    rows = json.loads((corpus/'manifest.json').read_text())['samples']
    rows = [{**r, 'file':str(corpus/r['file'])} for r in rows] + import_real(root, harvest)
    (root/'combined-manifest.json').write_text(json.dumps(rows, indent=2))
    (root/'combined-manifest.sha256').write_text(hashlib.sha256((root/'combined-manifest.json').read_bytes()).hexdigest()+'\n')
    train = [r for r in rows if r['split'] == 'train']; validation = [r for r in rows if r['split'] == 'validation']
    assert {r.get('documentId') for r in train if r['kind']=='real'}.isdisjoint({r.get('documentId') for r in validation if r['kind']=='real'})
    assert {r['label'].replace('-', '') for r in train if r['kind']=='synthetic'}.isdisjoint({r['label'].replace('-', '') for r in validation if r['kind']=='synthetic'})
    plan = {'checkpoints':[1000, 3000, 6000], 'learningRate':.0001, 'selection':'lowest synthetic validation CER, then highest exact accuracy, then earlier checkpoint',
            'train':len(train), 'validation':len(validation), 'baseHash':hashlib.sha256(base.read_bytes()).hexdigest(),
            'fixtureBRead':False, 'realValidation':'C, reported separately; no B selection', 'seed':320260923}
    (root/'training-plan.json').write_text(json.dumps(plan, indent=2))
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda r: feature(r, base), rows))
    random.Random(plan['seed']).shuffle(train)
    for split, part in [('train', train), ('validation', validation)]:
        (root/(split+'.list')).write_text('\n'.join(str(Path(r['file']).with_suffix('.lstmf')) for r in part)+'\n')
    baseline_file = root/'generic-validation.json'
    if not baseline_file.exists(): evaluate(validation, base, baseline_file)
    checkpoints = root/'checkpoints'; checkpoints.mkdir(exist_ok=True)
    start = time.monotonic(); curve = []
    for count in plan['checkpoints']:
        model = checkpoints/f'iter-{count}.traineddata'; report_file = checkpoints/f'iter-{count}-validation.json'
        if not report_file.exists():
            checkpoint = checkpoints/'pilot_checkpoint'
            args = ['lstmtraining', '--continue_from', checkpoint if checkpoint.exists() else root/'base/eng.lstm',
                    '--traineddata', base, '--train_listfile', root/'train.list', '--eval_listfile', root/'validation.list',
                    '--model_output', checkpoints/'pilot', '--learning_rate', plan['learningRate'], '--max_iterations', count,
                    '--target_error_rate', 0, '--debug_interval', 0]
            began = time.monotonic()
            run(args, checkpoints/f'iter-{count}-training.log')
            run(['lstmtraining', '--stop_training', '--continue_from', checkpoint, '--traineddata', base, '--model_output', model])
            report = evaluate(validation, model, report_file)
            report['stageSeconds'] = time.monotonic()-began
            report_file.write_text(json.dumps(report, indent=2))
        report = json.loads(report_file.read_text())
        curve.append({'iteration':count, 'model':str(model), 'metrics':report['metrics'], 'stageSeconds':report.get('stageSeconds')})
        (root/'learning-curve.json').write_text(json.dumps(curve, indent=2))
    chosen = min(curve, key=lambda r:(r['metrics']['synthetic']['cer'], -r['metrics']['synthetic']['exactAccuracy'], r['iteration']))
    final = root/'trimax_invoice_pilot_v1.traineddata'
    shutil.copyfile(chosen['model'], final)
    selection = {**chosen, 'selectedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                 'totalTrainingEvaluationSeconds':time.monotonic()-start, 'sha256':hashlib.sha256(final.read_bytes()).hexdigest(),
                 'fixtureBEvaluated':False}
    (root/'selection.json').write_text(json.dumps(selection, indent=2))
    print(json.dumps(selection), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('root', type=Path); parser.add_argument('harvest', type=Path)
    args = parser.parse_args(); main(args.root, args.harvest)
