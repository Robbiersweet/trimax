"""Frozen local recognition on hash-bound money crops; no labels or ledger access."""
import sys, json, time, hashlib, importlib.metadata
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / 'training'))
from phase3e_benchmark import Adapter

root = Path(sys.argv[1]).resolve()
inputs = json.loads((root / 'inputs.json').read_text())
assert all(set(r) == {'id', 'documentId', 'field', 'file', 'sha256'} for r in inputs)
assert all(r['field'] in ('row_amount', 'total') for r in inputs)
output = root / 'mature.json'
assert not output.exists(), 'Fresh inference output required'
result = {'models': {}, 'observations': [], 'training': False}
for name in ['svtr', 'parseq', 'ppocr']:
    start = time.perf_counter()
    adapter = Adapter(name, 'cuda' if name in ('svtr', 'parseq') else 'cpu')
    result['models'][name] = {'initMs': (time.perf_counter() - start) * 1000}
    for row in inputs:
        file = (root / row['file']).resolve()
        assert file.is_relative_to(root)
        assert hashlib.sha256(file.read_bytes()).hexdigest() == row['sha256']
        start = time.perf_counter()
        raw = adapter.read(file)['raw']  # Ignore the invoice-only constrained projection.
        result['observations'].append({**row, 'recognizer': name, 'raw': raw,
            'confidence': None, 'confidenceCalibrated': False,
            'ms': (time.perf_counter() - start) * 1000})
    del adapter
    output.write_text(json.dumps(result, indent=2))
    print(name, len(inputs), 'money fields complete', flush=True)
result['versions'] = {name: importlib.metadata.version(name) for name in ['torch', 'rapidocr', 'onnxruntime']}
output.write_text(json.dumps(result, indent=2))
