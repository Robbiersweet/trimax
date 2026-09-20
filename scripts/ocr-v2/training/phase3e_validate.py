"""Audit frozen inputs, metric arithmetic and no-invention decoder properties."""
import hashlib,json,sys,subprocess
from pathlib import Path
from phase3e_benchmark import constrained
from phase3e_report import alignment,metrics

root=Path(sys.argv[1]);inputs=json.loads((root/'inputs.json').read_text());truth=json.loads((root/'truth.json').read_text())
assert len(inputs)==96 and len(truth)==48
assert len({r['documentId'] for r in inputs})==8
for row in inputs:assert hashlib.sha256((root/row['file']).read_bytes()).hexdigest()==row['sha256']
for name in ['generic','pilot','ppocr','svtr','parseq','trocr']:
    data=json.loads((root/(name+'.json')).read_text());assert len(data['rows'])==96
    assert {r['file'] for r in data['rows']}=={r['file'] for r in inputs}
    hashes={r['file']:r['sha256'] for r in inputs}
    for r in data['rows']:
        assert r['sha256']==hashes[r['file']]
        if r['constrained'] is not None:
            suffix=r['raw'].strip().upper()[3:].removeprefix('-')
            assert len(r['constrained'].removeprefix('INV-'))==len(suffix)
assert constrained('INV12') is None
assert constrained('402') is None
assert constrained('garbageINV1234') is None
assert constrained('INV0000')=='INV-0000'
assert constrained('INV123456')=='INV-123456'
assert constrained('INVOS13') is None
chars=list('0123456789OISNV-');scores=[[0.0]*len(chars) for _ in range(7)]
scores[3][0]=1;scores[4][5]=1
assert constrained('INVOS13',scores,chars)=='INV-0513'
assert sum(op!='match' for *_,op in alignment('INV1234','INV124'))==1
assert sum(op!='match' for *_,op in alignment('INV1234','INV12345'))==1
assert sum(op!='match' for *_,op in alignment('INV1234','INV1284'))==1
print('PASS: 96 immutable inputs, six complete evaluations, eight disjoint document groups, decoder length/abstention, alignment S/I/D.')

home=Path.home();paths=[home/'trimax-ocr/phase3e/openocr_svtrv2_ch.pth',home/'.cache/torch/hub/checkpoints/parseq-bb5792a6.pt',home/'trimax-ocr/pilot-v1/modern-models/en_PP-OCRv5_rec_mobile.onnx',home/'trimax-ocr/pilot-v1/trimax_invoice_pilot_v1.traineddata',Path('/usr/share/tesseract-ocr/5/tessdata/eng.traineddata')]
paths+=list((home/'.cache/huggingface/hub/models--microsoft--trocr-small-printed/snapshots').glob('*/*safetensors'))
provenance={'weights':[{'path':str(p),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths if p.exists()], 'sourceCommits':{name:subprocess.check_output(['git','-C',str(home/'trimax-ocr/phase3e'/name),'rev-parse','HEAD'],text=True).strip() for name in ['parseq','OpenOCR']},'python':sys.version}
import importlib.metadata
provenance['packages']={n:importlib.metadata.version(n) for n in ['torch','torchvision','transformers','timm','pytorch-lightning','rapidocr','onnxruntime','pillow','numpy']}
(root/'provenance.json').write_text(json.dumps(provenance,indent=2))
