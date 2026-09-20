"""Export explicit train/validation line pairs; never export held-out images."""
import argparse,json,hashlib
from pathlib import Path
from PIL import Image
from dataset import validate, training_gate
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('dataset',type=Path);a=p.parse_args();root=a.dataset.resolve();r=json.loads((root/'dataset.json').read_text());validate(r['samples']);out=root.parent/'tesstrain-input-v1'
    lists={split:[] for split in ('train','validation')}
    for sample in r['samples']:
        if sample['split']=='heldout':continue
        source=root/sample['cropReference'];assert hashlib.sha256(source.read_bytes()).hexdigest()==sample['sha256']
        dest=out/sample['split']/(sample['sampleId']+'.png');dest.parent.mkdir(parents=True,exist_ok=True)
        with Image.open(source) as image:image.save(dest)
        dest.with_suffix('.gt.txt').write_text(sample['transcription']+'\n',encoding='utf8');lists[sample['split']].append(str(dest))
    for split,entries in lists.items():(out/(split+'.images.txt')).write_text('\n'.join(entries)+'\n',encoding='utf8')
    (out/'training-readiness.json').write_text(json.dumps(training_gate(r['samples']),indent=2))
    print(json.dumps({'exported':{k:len(v) for k,v in lists.items()},'trainingAllowed':training_gate(r['samples'])['ready'],'note':'Prepared line pairs only. No model trained.'}))
