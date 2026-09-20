"""Fixed evaluation on the same source crops; raw/literal and syntax output separate."""
import argparse,json,time,os,subprocess,re
from pathlib import Path
from PIL import Image,ImageOps
from pilot_train import edits

def main(root,manifest,engine,model):
    rows=json.loads(manifest.read_text());result=[];started=time.perf_counter()
    if engine=='crnn':
        import torch
        from sequence_model import CRNN,tensor,decode
        torch.set_num_threads(4);device='cuda' if torch.cuda.is_available() else 'cpu'
        net=CRNN().to(device);net.load_state_dict(torch.load(model,map_location=device,weights_only=True)['state']);net.eval()
    elif engine=='ppocr':
        import cv2,rapidocr
        from rapidocr import EngineType,LangRec,ModelType,OCRVersion
        from rapidocr.ch_ppocr_rec import TextRecognizer,TextRecInput
        from rapidocr.utils.parse_parameters import ParseParams
        cfg=ParseParams.load(Path(rapidocr.__file__).parent/'config.yaml')
        cfg=ParseParams.update_batch(cfg,{'Rec.engine_type':EngineType.ONNXRUNTIME,'Rec.lang_type':LangRec.EN,'Rec.model_type':ModelType.MOBILE,'Rec.ocr_version':OCRVersion.PPOCRV5,'EngineConfig.onnxruntime.intra_op_num_threads':4,'EngineConfig.onnxruntime.inter_op_num_threads':1})
        cfg.Rec.engine_cfg=cfg.EngineConfig.onnxruntime;cfg.Rec.font_path=None;cfg.Rec.model_root_dir=str(model);net=TextRecognizer(cfg.Rec)
    initms=(time.perf_counter()-started)*1000
    for row in rows:
        began=time.perf_counter();raw='';constrained=None
        if row['file']:
            source=root/row['file']
            if engine=='crnn':
                with torch.inference_mode():output=decode(net(tensor(Image.open(source))[None].to(device)))[0]
                raw=output['raw'];constrained=output['constrained']
            else:
                prepared=root/('prepared-'+engine+'-'+Path(row['file']).name)
                im=ImageOps.autocontrast(Image.open(source).convert('L'),cutoff=1);im=im.resize((im.width*2,im.height*2));ImageOps.expand(im,12,255).save(prepared)
                if engine=='ppocr':
                    r=net(TextRecInput(img=cv2.imread(str(prepared))));raw=r.txts[0] if r.txts else ''
                else:
                    args=['tesseract',str(prepared),'stdout','--psm','7','--dpi','300']
                    if engine=='pilot':args+=['--tessdata-dir',str(model.parent),'-l',model.stem]
                    else:args+=['-l','eng']
                    r=subprocess.run(args,capture_output=True,text=True,env=dict(os.environ,OMP_THREAD_LIMIT='1'),check=True);raw=r.stdout.strip()
        observed=''.join(raw.upper().split());truth=row['label'];canonical=lambda s:re.sub(r'^INV(?=\d)','INV-',s)
        result.append({**row,'raw':raw,'constrained':constrained,'observed':observed,'exact':truth==observed,'canonicalExact':canonical(truth)==canonical(observed),**edits(truth,observed),'ms':(time.perf_counter()-began)*1000})
    groups={}
    for kind in ['auto','manual']:
        rs=[r for r in result if r['kind']==kind];n=sum(r['characters'] for r in rs)
        groups[kind]={'rows':len(rs),'exact':sum(r['exact'] for r in rs),'canonicalExact':sum(r['canonicalExact'] for r in rs),'characterAccuracy':1-sum(r['distance'] for r in rs)/n,'CER':sum(r['distance'] for r in rs)/n,**{k:sum(r[k] for r in rs) for k in ['insertions','deletions','substitutions','ms']}}
    output={'engine':engine,'initMs':initms,'groups':groups,'rows':result}
    (root/(manifest.stem+'-'+engine+'.json')).write_text(json.dumps(output,indent=2));print(json.dumps({'engine':engine,'groups':groups}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('root',type=Path);p.add_argument('manifest',type=Path);p.add_argument('engine',choices=['generic','pilot','ppocr','crnn']);p.add_argument('--model',type=Path);a=p.parse_args();main(a.root,a.manifest,a.engine,a.model)
