"""Offline PP-OCRv5 CTC fine-tuning. Frozen crops; no business candidates or layout imports."""
import argparse,copy,hashlib,json,math,os,random,sys,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageOps,ImageEnhance,ImageFilter
from pilot_train import edits

def sha(file):return hashlib.sha256(Path(file).read_bytes()).hexdigest()

def prepare(image):
    image=ImageOps.autocontrast(image.convert('RGB'),cutoff=1)
    width=min(320,math.ceil(48*image.width/image.height));image=image.resize((width,48),Image.Resampling.BICUBIC)
    data=np.asarray(image,dtype=np.float32)[:,:,::-1].transpose(2,0,1)/127.5-1
    padded=np.zeros((3,48,320),np.float32);padded[:,:,:width]=data
    return padded

def corpus(root,previous,synthetic):
    root.mkdir(parents=True,exist_ok=False);rng=random.Random(320260923)
    plan={'train':['A','check2715','check2721','check2734','check2743'],'validation':['D'],'reserved':['B','C'],'historicalExposure':'B/C previously evaluated; reserved for this phase, not pristine','strategies':[{'name':'head-synthetic-heavy','mode':'head','realFraction':.125,'lr':.0001},{'name':'head-balanced','mode':'head','realFraction':.5,'lr':.0001},{'name':'late-balanced','mode':'late','realFraction':.5,'lr':.00002},{'name':'full-balanced','mode':'full','realFraction':.5,'lr':.00001}],'epochs':3,'stepsPerEpoch':100,'batchSize':32,'selection':'Maximum D automatic exact, then minimum D CER, then minimum synthetic validation CER; no reserved selection'}
    (root/'plan.json').write_text(json.dumps(plan,indent=2));rows=[]
    source=json.loads((synthetic/'manifest.json').read_text())
    for r in source:
        if r['kind']!='synthetic':continue
        if r['split']=='validation' and sum(x['split']=='validation' and x['kind']=='synthetic' for x in rows)>=300:continue
        rows.append({**r,'file':str(synthetic/r['file'])})
    real=json.loads((previous/'development.json').read_text());stats=[]
    for r in real:
        if r['kind']!='auto':continue
        assert r['documentId'] not in plan['reserved']
        split='validation' if r['documentId'] in plan['validation'] else 'train'
        original=Image.open(previous/r['file']).convert('RGB');gray=np.asarray(original.convert('L'))
        stats.append({'id':r['id'],'width':original.width,'height':original.height,'p10':float(np.percentile(gray,10)),'p90':float(np.percentile(gray,90)),'contrast':float(np.percentile(gray,90)-np.percentile(gray,10))})
        count=101 if split=='train' else 1
        for i in range(count):
            im=original.copy()
            if i:
                background=tuple(int(c) for c in np.median(np.asarray(im).reshape(-1,3),axis=0))
                im=im.rotate(rng.uniform(-1.5,1.5),Image.Resampling.BICUBIC,fillcolor=background)
                im=ImageEnhance.Contrast(im).enhance(rng.uniform(.35,1.2))
                im=im.filter(ImageFilter.GaussianBlur(rng.uniform(.1,.8)))
                im=im.resize((max(12,round(im.width*rng.uniform(.8,1.15))),max(10,round(im.height*rng.uniform(.8,1.1)))))
                arr=np.asarray(im,dtype=np.float32);yy,xx=np.mgrid[:im.height,:im.width]
                arr-=rng.uniform(0,18)*(xx/im.width)[...,None]
                # Sparse local print dropout, not replacement of whole characters.
                for _ in range(rng.randint(0,5)):
                    y=rng.randrange(im.height);x=rng.randrange(im.width-2);arr[y:y+1,x:x+2]=background
                im=Image.fromarray(np.clip(arr,0,255).astype('uint8'))
            file=root/f"{r['id']}-{i}.jpg";im.save(file,quality=rng.randint(60,95) if i else 100)
            rows.append({'file':str(file),'label':r['label'],'documentId':r['documentId'],'split':split,'kind':'real' if i==0 else 'augmented','sourceHash':sha(previous/r['file']),'parent':r['id']})
    (root/'manifest.json').write_text(json.dumps(rows,indent=2));(root/'training-optics.json').write_text(json.dumps(stats,indent=2))
    print(json.dumps({'samples':len(rows),'trainingRealOriginals':sum(r['kind']=='real' and r['split']=='train' for r in rows),'augmented':sum(r['kind']=='augmented' for r in rows)}),flush=True)

def setup(repo):
    sys.path.insert(0,str(repo));import paddle
    from ppocr.modeling.backbones.rec_lcnetv3 import PPLCNetV3
    from ppocr.modeling.necks.rnn import SequenceEncoder
    from ppocr.modeling.heads.rec_ctc_head import CTCHead
    chars=['blank']+(repo/'ppocr/utils/dict/ppocrv5_en_dict.txt').read_text().splitlines()+[' ']
    class CTCBranch(paddle.nn.Layer):
        def __init__(self,channels):
            # Disable training-only gradient detachment; forward values/weights unchanged.
            super().__init__();self.ctc_encoder=SequenceEncoder(in_channels=channels,encoder_type='svtr',dims=120,depth=2,hidden_dims=120,kernel_size=[1,3],use_guide=False);self.ctc_head=CTCHead(in_channels=120,out_channels=len(chars),fc_decay=.00001)
        def forward(self,x):return self.ctc_head(self.ctc_encoder(x))
    class Recognizer(paddle.nn.Layer):
        def __init__(self):
            super().__init__();self.backbone=PPLCNetV3(scale=.95);self.head=CTCBranch(self.backbone.out_channels)
        def forward(self,x):return self.head(self.backbone(x))
    return paddle,Recognizer,chars

def load(model,file,paddle):
    weights=paddle.load(str(file));own=model.state_dict();missing=[k for k in own if k not in weights or list(own[k].shape)!=list(weights[k].shape)]
    assert not missing,f'Pretrained tensor mismatch: {missing[:15]}'
    omitted=[k for k in weights if k not in own]
    assert all(k.startswith(('head.gtc_head.','head.before_gtc.')) for k in omitted),'Unexpected discarded pretrained layer'
    model.set_state_dict({k:weights[k] for k in own});return {'loadedTensors':len(own),'omittedAuxiliaryTensors':len(omitted),'sourceHash':sha(file)}

def decode(scores,chars):
    result=[]
    for seq in scores.argmax(-1):
        last=-1;text=''
        for c in seq:
            if c and c!=last:text+=chars[int(c)]
            last=c
        result.append(text)
    return result

def evaluate(model,rows,images,paddle,chars,batch=32):
    model.eval();result=[];began=time.perf_counter()
    with paddle.no_grad():
        for start in range(0,len(rows),batch):
            pred=decode(model(paddle.to_tensor(np.stack(images[start:start+batch]))).numpy(),chars)
            for row,raw in zip(rows[start:start+batch],pred):
                observed=''.join(raw.upper().split());result.append({**row,'raw':raw,'observed':observed,'exact':observed==row['label'],**edits(row['label'],observed)})
    return {'rows':result,'exact':sum(r['exact'] for r in result),'cer':sum(r['distance'] for r in result)/sum(r['characters'] for r in result),'ms':(time.perf_counter()-began)*1000}

def train(root,repo,base):
    paddle,Recognizer,chars=setup(repo);paddle.set_device('gpu');paddle.seed(320260923);rng=random.Random(320260923)
    rows=json.loads((root/'manifest.json').read_text());plan=json.loads((root/'plan.json').read_text());assert all(r.get('documentId') not in plan['reserved'] for r in rows)
    trainrows=[r for r in rows if r['split']=='train'];valrows=[r for r in rows if r['split']=='validation']
    # Cache processed input on CPU; all read paths are manifest-controlled development data.
    images=[prepare(Image.open(r['file'])) for r in trainrows];valimages=[prepare(Image.open(r['file'])) for r in valrows]
    realidx=[i for i,r in enumerate(trainrows) if r['kind']!='synthetic'];synidx=[i for i,r in enumerate(trainrows) if r['kind']=='synthetic'];history=[];best=None;began=time.perf_counter()
    baseline=Recognizer();baseAudit=load(baseline,base,paddle)
    (root/'baseline-validation.json').write_text(json.dumps(evaluate(baseline,valrows,valimages,paddle,chars),indent=2))
    (root/'pretrained-audit.json').write_text(json.dumps(baseAudit,indent=2));del baseline
    for strategy in plan['strategies']:
        model=Recognizer();audit=load(model,base,paddle)
        for name,p in model.named_parameters():
            p.stop_gradient=not (strategy['mode']=='full' or name.startswith('head.ctc_head') or (strategy['mode']=='late' and (name.startswith('head.ctc_encoder') or name.startswith('backbone.blocks6'))))
        audit['trainableParameters']=sum(int(np.prod(p.shape)) for p in model.parameters() if not p.stop_gradient)
        optimizer=paddle.optimizer.Adam(learning_rate=strategy['lr'],parameters=[p for p in model.parameters() if not p.stop_gradient],grad_clip=paddle.nn.ClipGradByGlobalNorm(5))
        lossfn=paddle.nn.CTCLoss(blank=0,reduction='mean');strategyStart=time.perf_counter()
        for epoch in range(1,plan['epochs']+1):
            model.train()
            # Preserve running statistics with scarce domain data, including frozen layers.
            for layer in model.sublayers():
                if isinstance(layer,(paddle.nn.BatchNorm1D,paddle.nn.BatchNorm2D)):layer.eval()
            losses=[]
            for step in range(plan['stepsPerEpoch']):
                nr=round(plan['batchSize']*strategy['realFraction']);indices=rng.choices(realidx,k=nr)+rng.choices(synidx,k=plan['batchSize']-nr);rng.shuffle(indices)
                labels=[trainrows[i]['label'] for i in indices];targets=np.zeros((len(labels),25),np.int32)
                for i,label in enumerate(labels):targets[i,:len(label)]=[chars.index(c) for c in label]
                logits=model(paddle.to_tensor(np.stack([images[i] for i in indices]))).transpose([1,0,2])
                loss=lossfn(logits,paddle.to_tensor(targets),paddle.to_tensor([logits.shape[0]]*len(labels),dtype='int64',place=paddle.CPUPlace()),paddle.to_tensor([len(s) for s in labels],dtype='int64'))
                loss.backward()
                if epoch==1 and step==0:
                    gradientNames=[name for name,p in model.named_parameters() if p.grad is not None]
                    assert any(name.startswith('head.ctc_head') for name in gradientNames)
                    if strategy['mode']!='head':assert any(name.startswith('backbone.') for name in gradientNames),'Backbone unexpectedly detached'
                    (root/(strategy['name']+'-gradient-audit.json')).write_text(json.dumps(gradientNames,indent=2))
                optimizer.step();optimizer.clear_grad();losses.append(float(loss))
            validation=evaluate(model,valrows,valimages,paddle,chars);real=[r for r in validation['rows'] if r['kind']=='real'];realExact=sum(r['exact'] for r in real);realCer=sum(r['distance'] for r in real)/sum(r['characters'] for r in real);score=(-realExact,realCer,validation['cer'])
            entry={'strategy':strategy,'epoch':epoch,'loss':float(np.mean(losses)),'realExact':realExact,'realCount':len(real),'realCER':realCer,'allValidationCER':validation['cer'],'strategySeconds':time.perf_counter()-strategyStart,'elapsedSeconds':time.perf_counter()-began};history.append(entry);print(json.dumps(entry),flush=True)
            if best is None or score<best:
                best=score;paddle.save(model.state_dict(),str(root/'selected.pdparams'));(root/'selected-validation.json').write_text(json.dumps(validation,indent=2));(root/'selected.json').write_text(json.dumps({**entry,'pretrained':audit},indent=2))
            (root/'training.json').write_text(json.dumps({'paddle':paddle.__version__,'history':history},indent=2))
    (root/'freeze.json').write_text(json.dumps({'sha256':sha(root/'selected.pdparams'),'planHash':sha(root/'plan.json'),'finishedAt':time.time()},indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('command',choices=['corpus','train']);p.add_argument('root',type=Path);p.add_argument('--previous',type=Path);p.add_argument('--synthetic',type=Path);p.add_argument('--repo',type=Path);p.add_argument('--base',type=Path);a=p.parse_args()
    if a.command=='corpus':corpus(a.root,a.previous,a.synthetic)
    else:train(a.root,a.repo,a.base)
