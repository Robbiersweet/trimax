"""Offline frozen-input recognition. Truth is deliberately unavailable to adapters."""
import argparse, json, os, sys, time, subprocess, re, statistics
from pathlib import Path
from PIL import Image, ImageDraw

def constrained(raw, scores=None, chars=None):
    # Preserve the model's observed number of character positions and prefix.
    token=raw.strip().upper()
    if not re.fullmatch(r'INV-?[A-Z0-9]{4,}',token): return None
    suffix=token[4:] if token.startswith('INV-') else token[3:]
    if suffix.isdigit(): return 'INV-'+suffix
    if scores is None or len(scores)!=len(token): return None
    offset=len(token)-len(suffix); out=[]
    for i,c in enumerate(suffix,offset):
        if c.isdigit(): out.append(c); continue
        choices=[(float(scores[i][j]),ch) for j,ch in enumerate(chars) if ch in '0123456789' and len(ch)==1]
        if not choices: return None
        out.append(max(choices)[1])
    return 'INV-'+''.join(out)

class Adapter:
    def __init__(self,name,device):
        self.name=name; self.device=device; self.net=None
        home=Path.home()/'trimax-ocr'; self.home=home
        if name in ('parseq','svtr','trocr'):
            import torch
            self.torch=torch; torch.set_num_threads(4)
        if name=='parseq':
            sys.path.insert(0,str(home/'phase3e/parseq'))
            from strhub.models.utils import create_model
            from strhub.data.module import SceneTextDataModule
            self.net=create_model('parseq',True).to(device).eval()
            self.transform=SceneTextDataModule.get_transform(self.net.hparams.img_size)
        elif name=='svtr':
            sys.path.insert(0,str(home/'phase3e/OpenOCR'))
            import yaml
            from tools.infer_rec import OpenRecognizer
            cfg=yaml.safe_load((home/'phase3e/OpenOCR/configs/rec/svtrv2/svtrv2_ch.yml').read_text())
            cfg['Global']['pretrained_model']=str(home/'phase3e/openocr_svtrv2_ch.pth')
            self.rec=OpenRecognizer(cfg,mode='server',use_gpu='true' if device=='cuda' else 'false'); self.net=self.rec.model
        elif name=='trocr':
            from transformers import TrOCRProcessor,VisionEncoderDecoderModel
            self.processor=TrOCRProcessor.from_pretrained('microsoft/trocr-small-printed')
            self.net=VisionEncoderDecoderModel.from_pretrained('microsoft/trocr-small-printed').to(device).eval()
        elif name=='ppocr':
            import rapidocr
            from rapidocr import EngineType,LangRec,ModelType,OCRVersion
            from rapidocr.ch_ppocr_rec import TextRecognizer,TextRecInput
            from rapidocr.utils.parse_parameters import ParseParams
            cfg=ParseParams.load(Path(rapidocr.__file__).parent/'config.yaml')
            cfg=ParseParams.update_batch(cfg,{'Rec.engine_type':EngineType.ONNXRUNTIME,'Rec.lang_type':LangRec.EN,'Rec.model_type':ModelType.MOBILE,'Rec.ocr_version':OCRVersion.PPOCRV5,'EngineConfig.onnxruntime.intra_op_num_threads':4,'EngineConfig.onnxruntime.inter_op_num_threads':1})
            cfg.Rec.engine_cfg=cfg.EngineConfig.onnxruntime;cfg.Rec.font_path=None;cfg.Rec.model_root_dir=str(home/'pilot-v1/modern-models')
            self.net=TextRecognizer(cfg.Rec);self.input=TextRecInput
    def read(self,file):
        raw=''; scores=None; chars=None
        if self.name=='parseq':
            with self.torch.inference_mode():
                probs=self.net(self.transform(Image.open(file).convert('RGB'))[None].to(self.device)).softmax(-1)
                raw=self.net.tokenizer.decode(probs)[0][0]
                scores=probs[0,:len(raw)].cpu().tolist(); chars=self.net.tokenizer._itos[:probs.shape[-1]]
        elif self.name=='svtr':
            raw=self.rec(img_path=str(file))[0]['text']
        elif self.name=='trocr':
            with self.torch.inference_mode():
                pixels=self.processor(images=Image.open(file).convert('RGB'),return_tensors='pt').pixel_values.to(self.device)
                ids=self.net.generate(pixels,max_new_tokens=32,num_beams=1)
                raw=self.processor.batch_decode(ids,skip_special_tokens=True)[0]
        elif self.name=='ppocr':
            import cv2
            result=self.net(self.input(img=cv2.imread(str(file))));raw=result.txts[0] if result.txts else ''
        else:
            cmd=['tesseract',str(file),'stdout','--psm','7','--dpi','300']
            if self.name=='pilot':cmd+=['--tessdata-dir',str(self.home/'pilot-v1'),'-l','trimax_invoice_pilot_v1']
            else:cmd+=['-l','eng']
            raw=subprocess.run(cmd,capture_output=True,text=True,check=True,env=dict(os.environ,OMP_THREAD_LIMIT='1')).stdout.strip()
        if self.device=='cuda':self.torch.cuda.synchronize()
        return {'raw':raw,'constrained':constrained(raw,scores,chars),'constraintMode':'position-logits' if scores is not None else 'grammar-validation-only'}

def main(a):
    start=time.perf_counter(); adapter=Adapter(a.model,a.device);init=(time.perf_counter()-start)*1000
    out=a.root/(a.model+('-diagnostic' if a.diagnostic else '')+'.json'); rows=[]
    if out.exists(): rows=json.loads(out.read_text())['rows']
    done={r['file'] for r in rows}
    result={'model':a.model,'device':a.device,'initMs':init,'rows':rows}
    inputs=json.loads((a.root/('diagnostic-inputs.json' if a.diagnostic else 'inputs.json')).read_text())
    for row in sorted(inputs,key=lambda r:(r['documentId'],r['id'],r['kind'],r['variant'])):
        if row['file'] in done:continue
        start=time.perf_counter(); recognized=adapter.read(a.root/row['file'])
        rows.append({**row,**recognized,'ms':(time.perf_counter()-start)*1000})
        out.write_text(json.dumps(result,indent=2));print(a.model,len(rows),row['file'],recognized['raw'],flush=True)
    # Performance repeats use an unrelated synthetic token, not held-out evidence.
    probe=a.root/'latency-probe.png'
    if not probe.exists():
        im=Image.new('RGB',(240,48),'white');ImageDraw.Draw(im).text((8,10),'INV-9876',fill='black',font_size=24);im.save(probe)
    times={}
    for device in (['cuda','cpu'] if a.model in ('parseq','svtr','trocr') else ['cpu']):
        adapter.device=device
        if a.model in ('parseq','svtr','trocr'):
            adapter.net.to(device)
            if a.model=='svtr':adapter.rec.device=adapter.torch.device(device)
        adapter.read(probe); measurements=[]
        for _ in range(5):
            t=time.perf_counter();adapter.read(probe);measurements.append((time.perf_counter()-t)*1000)
        times[device]={'cropMsMedian':statistics.median(measurements),'fiveRowsSequentialMs':sum(measurements),'samplesMs':measurements}
    result['latency']=times;out.write_text(json.dumps(result,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('root',type=Path);p.add_argument('model',choices=['generic','pilot','ppocr','svtr','parseq','trocr']);p.add_argument('--device',default='cpu');p.add_argument('--diagnostic',action='store_true');main(p.parse_args())
