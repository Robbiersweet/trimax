"""Isolated invoice line CRNN. No database, candidate lists or production integration."""
import argparse, hashlib, json, random, re, time
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps, ImageEnhance, ImageFilter
import torch
from torch import nn
from torch.utils.data import Dataset, DataLoader
from pilot_corpus import render
from pilot_train import edits

CHARS='0123456789INV-'

def tensor(image):
    image=ImageOps.autocontrast(image.convert('L'), cutoff=1)
    # Consistent line canvas, preserve aspect ratio and all observed characters.
    image.thumbnail((184,28),Image.Resampling.LANCZOS)
    canvas=Image.new('L',(192,32),255);canvas.paste(image,(4,(32-image.height)//2))
    return torch.from_numpy((np.asarray(canvas,dtype=np.float32)/127.5-1)[None].copy())

class CRNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.cnn=nn.Sequential(nn.Conv2d(1,32,3,padding=1),nn.ReLU(),nn.MaxPool2d(2),
            nn.Conv2d(32,64,3,padding=1),nn.ReLU(),nn.MaxPool2d(2),
            nn.Conv2d(64,128,3,padding=1),nn.BatchNorm2d(128),nn.ReLU(),nn.MaxPool2d((2,1)),
            nn.Conv2d(128,128,3,padding=1),nn.ReLU(),nn.AdaptiveAvgPool2d((1,48)))
        self.sequence=nn.LSTM(128,128,bidirectional=True,batch_first=True)
        self.head=nn.Linear(256,len(CHARS)+1)
    def forward(self,x):
        x=self.cnn(x).squeeze(2).permute(0,2,1)
        return self.head(self.sequence(x)[0]).log_softmax(-1)

def decode(logits):
    result=[]
    for seq in logits.argmax(-1).tolist():
        last=0;token=''
        for c in seq:
            if c and c!=last:token+=CHARS[c-1]
            last=c
        # Reject-only grammar: no insertion, digit correction or numeric lookup.
        result.append({'raw':token,'constrained':token if re.fullmatch(r'INV-\d{4,}',token) else None,
            'literalValid':bool(re.fullmatch(r'INV-?\d{4,}',token))})
    return result

class Corpus(Dataset):
    def __init__(self,root,rows):
        self.rows=rows;self.images=[tensor(Image.open(root/r['file'])) for r in rows]
    def __len__(self):return len(self.rows)
    def __getitem__(self,i):return self.images[i],self.rows[i]['label']

def generate(root,realroot):
    root.mkdir(parents=True,exist_ok=False);rng=random.Random(202609209)
    real=json.loads((realroot/'development.json').read_text())
    assert {r['documentId'] for r in real}.isdisjoint({'B','C'})
    plan=json.loads((realroot/'split-plan.json').read_text());(root/'split-plan.json').write_text(json.dumps(plan,indent=2))
    reserved={506,507,513,514,515,518,519}
    numbers=[n for n in range(100000) if n not in reserved];rng.shuffle(numbers)
    fonts=sorted(Path('/usr/share/fonts/truetype/liberation').glob('*.ttf'))+sorted(Path('/usr/share/fonts/truetype/dejavu').glob('*.ttf'))
    valfonts=sorted(Path('/usr/share/fonts/truetype/freefont').glob('*.ttf'));rows=[]
    for split,count,start in [('train',20000,0),('validation',1000,20000)]:
        (root/split).mkdir()
        for i in range(count):
            token=f'INV-{numbers[start+i]:04d}'
            if rng.random()<.5:token=token.replace('-','')
            im,families=render(token,rng.choice(fonts if split=='train' else valfonts),rng)
            # Tight line crops match real token geometry; preserve faint ink.
            arr=np.asarray(im);mask=arr<np.percentile(arr,90)-15
            if mask.any():
                ys,xs=np.where(mask);im=im.crop((max(0,xs.min()-3),max(0,ys.min()-3),min(im.width,xs.max()+4),min(im.height,ys.max()+4)))
            file=f'{split}/synthetic-{i:05d}.png';im.save(root/file)
            rows.append({'file':file,'label':token,'split':split,'kind':'synthetic','degradations':families})
    for r in real:
        if r['kind']!='manual':continue
        count=100 if r['split']=='train' else 1
        for j in range(count):
            im=Image.open(realroot/r['file']).convert('L')
            if j:
                im=im.rotate(rng.uniform(-1.5,1.5),Image.Resampling.BICUBIC,fillcolor=int(np.median(im)))
                im=ImageEnhance.Contrast(im).enhance(rng.uniform(.65,1.4))
                im=im.filter(ImageFilter.GaussianBlur(rng.uniform(0,.45)))
                im=im.resize((max(12,round(im.width*rng.uniform(.85,1.1))),max(8,round(im.height*rng.uniform(.85,1.1)))))
            file=f"{r['split']}/real-{r['id']}-{j}.png";im.save(root/file)
            rows.append({'file':file,'label':r['label'],'split':r['split'],'kind':'real' if j==0 else 'augmented','documentId':r['documentId'],'parent':r['id']})
    (root/'manifest.json').write_text(json.dumps(rows,indent=2));print(json.dumps({'samples':len(rows)}),flush=True)

def evaluate(model,loader,device):
    model.eval();records=[]
    with torch.inference_mode():
        for images,labels in loader:
            outputs=decode(model(images.to(device)))
            for truth,pred in zip(labels,outputs):records.append({'label':truth,**pred,**edits(truth,pred['raw']),'exact':truth==pred['raw']})
    return {'exact':sum(r['exact'] for r in records)/len(records),'cer':sum(r['distance'] for r in records)/sum(r['characters'] for r in records),'rows':records}

def train(root,epochs):
    torch.manual_seed(20260920);torch.set_num_threads(4)
    device='cuda' if torch.cuda.is_available() else 'cpu'
    rows=json.loads((root/'manifest.json').read_text());assert not any(r.get('documentId') in ['B','C'] for r in rows)
    trainset=Corpus(root,[r for r in rows if r['split']=='train']);valset=Corpus(root,[r for r in rows if r['split']=='validation'])
    loader=DataLoader(trainset,batch_size=128,shuffle=True);val=DataLoader(valset,batch_size=128)
    model=CRNN().to(device);opt=torch.optim.AdamW(model.parameters(),lr=.001);lossfn=nn.CTCLoss(zero_infinity=True)
    started=time.perf_counter();best=float('inf');history=[]
    for epoch in range(1,epochs+1):
        model.train();losses=[]
        for images,labels in loader:
            logits=model(images.to(device)).transpose(0,1)
            target=torch.tensor([CHARS.index(c)+1 for label in labels for c in label],dtype=torch.long)
            loss=lossfn(logits,target,torch.full((len(labels),),logits.shape[0],dtype=torch.long),torch.tensor([len(s) for s in labels]))
            opt.zero_grad();loss.backward();nn.utils.clip_grad_norm_(model.parameters(),5);opt.step();losses.append(loss.item())
        report=evaluate(model,val,device);score=report['cer'];entry={'epoch':epoch,'loss':float(np.mean(losses)),'validationExact':report['exact'],'validationCER':score,'elapsedSeconds':time.perf_counter()-started};history.append(entry);print(json.dumps(entry),flush=True)
        if score<best:
            best=score;torch.save({'state':model.state_dict(),'chars':CHARS,'epoch':epoch},root/'best.pt');(root/'best-validation.json').write_text(json.dumps(report,indent=2))
        (root/'training.json').write_text(json.dumps({'torch':torch.__version__,'device':device,'parameters':sum(p.numel() for p in model.parameters()),'history':history},indent=2))
    (root/'model.sha256').write_text(hashlib.sha256((root/'best.pt').read_bytes()).hexdigest())

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('command',choices=['generate','train']);p.add_argument('root',type=Path);p.add_argument('--real',type=Path);p.add_argument('--epochs',type=int,default=25);a=p.parse_args()
    if a.command=='generate':generate(a.root,a.real)
    else:train(a.root,a.epochs)
