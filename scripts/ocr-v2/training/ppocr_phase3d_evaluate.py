"""One frozen recognition evaluation; CPU/GPU latency uses development D only."""
import argparse,json,time,re,sys
from pathlib import Path
import numpy as np
from PIL import Image
from ppocr_phase3d import setup,load,prepare,evaluate,sha

def main(root,previous,repo):
    freeze=json.loads((root/'freeze.json').read_text());assert sha(root/'selected.pdparams')==freeze['sha256']
    marker=root/'reserved-started.json'
    assert not marker.exists(),'Reserved evaluation already started; do not silently repeat'
    paddle,Recognizer,chars=setup(repo);paddle.set_device('gpu');started=time.perf_counter();model=Recognizer();load(model,root/'selected.pdparams',paddle);model.eval();paddle.device.cuda.synchronize();loadms=(time.perf_counter()-started)*1000
    (root/'reserved-started.json').write_text(json.dumps({'checkpoint':freeze['sha256'],'time':time.time()}))
    reports={};generic=Recognizer();load(generic,root.parent/'en_PP-OCRv5_mobile_rec_pretrained.pdparams',paddle);generic.eval()
    for split in ['development','holdout']:
        rows=json.loads((previous/(split+'.json')).read_text());images=[prepare(Image.open(previous/r['file'])) for r in rows]
        matchedBaseline=evaluate(generic,rows,images,paddle,chars)
        (root/(split+'-matched-generic.json')).write_text(json.dumps(matchedBaseline,indent=2))
        report=evaluate(model,rows,images,paddle,chars);groups={}
        for kind in ['auto','manual']:
            rs=[r for r in report['rows'] if r['kind']==kind];n=sum(r['characters'] for r in rs)
            groups[kind]={'count':len(rs),'exact':sum(r['exact'] for r in rs),'characterAccuracy':1-sum(r['distance'] for r in rs)/n,'CER':sum(r['distance'] for r in rs)/n,**{key:sum(r[key] for r in rs) for key in ['insertions','deletions','substitutions']}}
        for r in report['rows']:
            r['normalizedFormattingOnly']=re.sub(r'^INV(?=\d{4,}$)','INV-',r['observed'])
            r['syntaxAccepted']=bool(re.fullmatch(r'INV-\d{4,}',r['normalizedFormattingOnly']))
            r['characterAccuracy']=1-r['distance']/r['characters']
        report['groups']=groups;reports[split]=report;(root/(split+'-evaluation.json')).write_text(json.dumps(report,indent=2));print(json.dumps({'split':split,'groups':groups}),flush=True)
    dev=json.loads((previous/'development.json').read_text());d=[r for r in dev if r['documentId']=='D' and r['kind']=='auto'];arrays=[prepare(Image.open(previous/r['file'])) for r in d];latencies={}
    for device in ['gpu','cpu']:
        paddle.set_device(device);began=time.perf_counter();m=Recognizer();load(m,root/'selected.pdparams',paddle);m.eval();init=(time.perf_counter()-began)*1000
        single=[];five=[]
        with paddle.no_grad():
            for _ in range(12):
                for count,times in [(1,single),(5,five)]:
                    data=paddle.to_tensor(np.stack(arrays[:count]));t=time.perf_counter();m(data).numpy();times.append((time.perf_counter()-t)*1000)
        latencies[device]={'modelLoadMs':init,'firstCropMs':single[0],'perCropMedianMs':float(np.median(single[2:])),'fiveRowBatchMedianMs':float(np.median(five[2:])),'samples':10,'source':'D validation automatic crops; reserved inference not repeated'}
    report={'initialGpuModelLoadMs':loadms,'bytes':(root/'selected.pdparams').stat().st_size,'sha256':freeze['sha256'],'latencies':latencies};(root/'performance.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('root',type=Path);p.add_argument('previous',type=Path);p.add_argument('repo',type=Path);a=p.parse_args();main(a.root,a.previous,a.repo)
