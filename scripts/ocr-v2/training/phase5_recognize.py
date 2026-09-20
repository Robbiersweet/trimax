"""Fresh per-document inference with frozen Phase 3E adapters; no labels or cache reuse."""
import json, sys, time
from pathlib import Path
from phase3e_benchmark import Adapter

root = Path(sys.argv[1])
inputs = json.loads((root / 'inputs.json').read_text())
output = root / 'recognition.json'
if output.exists():
    raise RuntimeError('Fresh output directory required')
observations = []
for name in ['svtr', 'parseq', 'ppocr']:
    start = time.perf_counter()
    adapter = Adapter(name, 'cuda' if name != 'ppocr' else 'cpu')
    init_ms = (time.perf_counter() - start) * 1000
    for row in inputs:
        start = time.perf_counter()
        result = adapter.read(root / row['file'])
        observations.append({**row, 'recognizer': name, 'raw': result['raw'],
                             'ms': (time.perf_counter() - start) * 1000,
                             'modelInitMs': init_ms})
output.write_text(json.dumps(observations, indent=2))
