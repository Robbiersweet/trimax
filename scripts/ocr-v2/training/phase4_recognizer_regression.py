"""Fresh offline recognition rerun; no training or new output selection."""
import json,os,shutil,subprocess,sys
from pathlib import Path
root=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
inputs=json.loads((root/'inputs.json').read_text())
for file in ['inputs.json','truth.json']+[r['file'] for r in inputs]:shutil.copyfile(root/file,out/file)
results={}
for model in ['generic','pilot','ppocr','svtr','parseq','trocr']:
    target=out/(model+'.json')
    if target.exists():raise RuntimeError('Use a new output directory to guarantee fresh recognition')
    cmd=[sys.executable,str(Path(__file__).with_name('phase3e_benchmark.py')),str(out),model]
    if model in ['svtr','parseq','trocr']:cmd+=['--device','cuda']
    with (out/(model+'.log')).open('w') as log:
        subprocess.run(cmd,env=dict(os.environ,HF_HUB_OFFLINE='1'),stdout=log,stderr=subprocess.STDOUT,check=True)
    old={r['file']:r['raw'] for r in json.loads((root/(model+'.json')).read_text())['rows']}
    rows=json.loads(target.read_text())['rows'];assert len(rows)==96
    differences=[{'file':r['file'],'before':old[r['file']],'after':r['raw']} for r in rows if old[r['file']]!=r['raw']]
    results[model]={'observations':len(rows),'differences':differences}
    print(model,len(rows),'observations;',len(differences),'differences',flush=True)
(out/'comparison.json').write_text(json.dumps(results,indent=2))
assert not any(r['differences'] for r in results.values()),'Recognition changes require review'
