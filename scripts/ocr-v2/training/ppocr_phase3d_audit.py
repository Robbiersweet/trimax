"""Verify experiment provenance and selected parameter changes without OCR inference."""
import argparse,json,sys
from pathlib import Path
import numpy as np
import paddle
from ppocr_phase3d import sha

def main(root,base):
    rows=json.loads((root/'manifest.json').read_text());plan=json.loads((root/'plan.json').read_text());freeze=json.loads((root/'freeze.json').read_text())
    train={r['documentId'] for r in rows if r.get('documentId') and r['split']=='train'};val={r['documentId'] for r in rows if r.get('documentId') and r['split']=='validation'}
    assert not train&val and not (train|val)&set(plan['reserved'])
    assert sha(root/'selected.pdparams')==freeze['sha256']
    old=paddle.load(str(base));new=paddle.load(str(root/'selected.pdparams'));changed=[k for k in new if not np.array_equal(new[k].numpy(),old[k].numpy())]
    selection=json.loads((root/'selected.json').read_text())
    if selection['strategy']['mode']=='head':assert changed and all(k.startswith('head.ctc_head.') for k in changed)
    report={'python':sys.version,'paddle':paddle.__version__,'cuda':paddle.version.cuda(),'gpu':paddle.device.cuda.get_device_name(0),'trainDocuments':sorted(train),'validationDocuments':sorted(val),'reservedDocuments':plan['reserved'],'modelSha256':freeze['sha256'],'changedTensors':changed,'unchangedTensors':len(new)-len(changed),'retainedTensorCount':len(new),'manifestSha256':sha(root/'manifest.json')}
    (root/'audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('root',type=Path);p.add_argument('base',type=Path);a=p.parse_args();main(a.root,a.base)
