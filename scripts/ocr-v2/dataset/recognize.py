"""Label-free batch inference using the frozen research adapters; no training."""
import sys, json, time, hashlib, importlib.metadata, subprocess
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'training'))
from phase3e_benchmark import Adapter

root = Path(sys.argv[1])
inputs = json.loads((root / 'inputs.json').read_text())
allowed = {'id', 'documentId', 'file', 'sha256'}
assert all(set(row) == allowed for row in inputs), 'Unexpected inference fields'
assert not (root / 'recognition.json').exists(), 'Fresh inference directory required'
observations, models = [], {}
for name in ['generic', 'pilot', 'ppocr', 'svtr', 'parseq']:
    started = time.perf_counter()
    adapter = Adapter(name, 'cuda' if name in ('svtr', 'parseq') else 'cpu')
    models[name] = {'initMs': (time.perf_counter() - started) * 1000, 'status': 'available'}
    for row in inputs:
        file = (root / row['file']).resolve()
        assert file.is_relative_to(root.resolve())
        assert hashlib.sha256(file.read_bytes()).hexdigest() == row['sha256']
        started = time.perf_counter()
        result = adapter.read(file)
        observations.append({**row, 'recognizer': name, 'raw': result['raw'], 'ms': (time.perf_counter() - started) * 1000})
    del adapter
versions = {name: importlib.metadata.version(name) for name in ['torch','rapidocr','onnxruntime','transformers']}
versions['tesseract'] = subprocess.check_output(['tesseract','--version'], text=True).splitlines()[0]
home = Path.home() / 'trimax-ocr'
weights = [home/'pilot-v1/trimax_invoice_pilot_v1.traineddata', home/'phase3e/openocr_svtrv2_ch.pth']
weights += list((home/'pilot-v1/modern-models').rglob('*.onnx'))
weights += list((Path.home()/'.cache/torch/hub/checkpoints').glob('*parseq*'))
weights += list(Path('/usr/share/tesseract-ocr').rglob('eng.traineddata'))
versions['weights'] = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in weights if p.is_file()}
(root/'recognition.json').write_text(json.dumps({'schemaVersion':1,'models':models,'versions':versions,'observations':observations},indent=2))
