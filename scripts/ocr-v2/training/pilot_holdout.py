"""One-shot heldout comparison. Selection must already exist; no training here."""
import argparse
import hashlib
import json
import time
from pathlib import Path
from pilot_train import evaluate


def main(root, inputs):
    selection = json.loads((root/'selection.json').read_text())
    model = root/'trimax_invoice_pilot_v1.traineddata'
    assert hashlib.sha256(model.read_bytes()).hexdigest() == selection['sha256']
    rows = json.loads(inputs.read_text())
    assert len(rows) == 5 and all(r['protectedFixture'] == 'B' for r in rows)
    assert len({r['id'] for r in rows}) == 5
    for r in rows:
        r['file'] = str((inputs.parent/r['file']).resolve())
        assert hashlib.sha256(Path(r['file']).read_bytes()).hexdigest() == r['sha256']
    # Atomic marker precedes inference, so failures cannot silently rerun holdout.
    with (root/'holdout-started.json').open('x') as f:
        json.dump({'startedAt':time.time(), 'selection':selection, 'inputsHash':hashlib.sha256(inputs.read_bytes()).hexdigest()}, f, indent=2)
    reports = {}
    for name, target in [('generic', root/'base/eng.traineddata'), ('pilot', model)]:
        reports[name] = evaluate(rows, target, root/(name+'-fixture-b.json'))
    (root/'holdout-complete.json').write_text(json.dumps({'completedAt':time.time(), 'metrics':{k:r['metrics'] for k,r in reports.items()}}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('root', type=Path); parser.add_argument('inputs', type=Path)
    args = parser.parse_args(); main(args.root, args.inputs)
