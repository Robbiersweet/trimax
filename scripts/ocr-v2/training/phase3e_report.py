"""Score saved predictions only; labels never enter model inference."""
import json,re,sys,collections
from pathlib import Path
from PIL import Image,ImageDraw

def norm(s):return ''.join(s.upper().split())
def canonical(s):return re.sub(r'^INV-?(?=\d)', 'INV-',norm(s))
def alignment(a,b):
    d=[[0]*(len(b)+1) for _ in range(len(a)+1)]
    for i in range(len(a)+1):d[i][0]=i
    for j in range(len(b)+1):d[0][j]=j
    for i in range(1,len(a)+1):
        for j in range(1,len(b)+1):d[i][j]=min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]!=b[j-1]))
    i,j=len(a),len(b); ops=[]
    while i or j:
        if i and j and d[i][j]==d[i-1][j-1]+(a[i-1]!=b[j-1]):
            ops.append((i-1,a[i-1],b[j-1],'match' if a[i-1]==b[j-1] else 'substitution'));i-=1;j-=1
        elif i and d[i][j]==d[i-1][j]+1:ops.append((i-1,a[i-1],'∅','deletion'));i-=1
        else:ops.append((i,'∅',b[j-1],'insertion'));j-=1
    return list(reversed(ops))
def metrics(rows,truth,constrain=False):
    c=collections.Counter(); chars=0;exact=0;rawexact=0;formatted=0
    for r in rows:
        t=truth[r['id'],r['kind']];raw=r['constrained'] or '' if constrain else r['raw'];a=canonical(t) if constrain else norm(t);b=canonical(raw) if constrain else norm(raw)
        exact+=a==b;rawexact+=t==raw;formatted+=canonical(t)==canonical(raw);chars+=len(a)
        c.update(op for _,_,_,op in alignment(a,b) if op!='match')
    dist=sum(c.values());return {'rows':len(rows),'exact':exact,'rawExact':rawexact,'formatExact':formatted,'characters':chars,'characterAccuracy':1-dist/chars,'CER':dist/chars,**dict(c)}
def main(root):
    truth={(r['id'],r['kind']):r['label'] for r in json.loads((root/'truth.json').read_text())};summary={};errors=[];conf=collections.Counter();failures=collections.defaultdict(list)
    for model in ['generic','pilot','ppocr','svtr','parseq','trocr']:
        p=root/(model+'.json')
        if not p.exists():continue
        data=json.loads(p.read_text());rows=data['rows'];assert len(rows)==96,(model,len(rows));assert len({r['file'] for r in rows})==96
        summary[model]={'initMs':data['initMs'],'latency':data.get('latency',{}),'groups':{},'folds':{}}
        for kind in ['auto','manual']:
            for variant in ['native','enhanced']:
                rs=[r for r in rows if r['kind']==kind and r['variant']==variant]
                summary[model]['groups'][kind+'-'+variant]=metrics(rs,truth)
                summary[model]['groups'][kind+'-'+variant+'-constrained']=metrics(rs,truth,True)
                summary[model]['folds'][kind+'-'+variant]={doc:metrics([r for r in rs if r['documentId']==doc],truth) for doc in sorted({r['documentId'] for r in rs})}
        for r in rows:
            t=truth[r['id'],r['kind']];pred=norm(r['raw']);ops=alignment(t,pred)
            if t==pred:continue
            bad=[x for x in ops if x[3]!='match'];classes=[]
            if t.startswith('INV') and not pred.startswith('INV'):classes.append('prefix loss/corruption')
            if pred.find('INV')>0:classes.append('leading garbage')
            for op,label in [('substitution','digit substitution'),('deletion','digit deletion'),('insertion','digit insertion')]:
                if any(x[3]==op and (x[1].isdigit() or (op=='insertion' and x[2].isdigit())) for x in bad):classes.append(label)
            if sum(x[1].isdigit() for x in bad)>=2:classes.append('multiple-digit corruption')
            errors.append({'model':model,**r,'expected':t,'classes':classes or ['other token corruption'],'alignment':bad,'cropClipping':'not observed in frozen crop audit','informationUnavailable':'not proven','missingHyphen':'not scored: no source truth token contains a printed hyphen'})
            if r['kind']=='auto' and r['variant']=='native':
                conf.update(x[1]+'→'+x[2] for x in bad)
                if model in ['ppocr','svtr','parseq','trocr']:
                    for pos,ch,observed,op in bad:
                        if op!='insertion':failures[r['id'],pos,ch].append({'model':model,'observed':observed})
    possible=[{'row':k[0],'position':k[1],'expected':k[2],'models':v,'conclusion':'possible image-information limitation; not proven'} for k,v in failures.items() if len(v)>=2]
    report={'models':summary,'errors':errors,'confusionMatrix':dict(conf),'requestedConfusionGroups':{g:{k:v for k,v in conf.items() if k.split('→')[0] in g.split('/') and k.split('→')[1] in g.split('/')} for g in ['0/O/U','1/I/L','2/Z','3/S','4/A','5/S','6/G','7/T','8/B','9/R']},'hyphenDeletion':0,'hyphenCaveat':'No printed hyphens in ground truth; cannot measure hyphen recall.','possibleInformationLimitations':possible}
    (root/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps({m:d['groups']['auto-native'] for m,d in summary.items()},indent=2))
    ids=sorted({p['row'] for p in possible});sheet=Image.new('RGB',(1100,max(1,len(ids))*180),'white');draw=ImageDraw.Draw(sheet)
    diagnostic=[]
    for idx,rid in enumerate(ids):
        source=Image.open(root/(rid+'-auto-native.png')).convert('RGB');up=source.resize((source.width*3,source.height*3),Image.Resampling.LANCZOS);up.save(root/(rid+'-auto-upscale.png'))
        for col,(name,im) in enumerate([('native',source),('3x Lanczos',up),('local contrast',Image.open(root/(rid+'-auto-enhanced.png')).convert('RGB'))]):
            im.thumbnail((350,140));sheet.paste(im,(col*365,idx*180+28));draw.text((col*365,idx*180+5),rid+' '+name,fill='black')
        diagnostic.append({'id':rid,'documentId':rid.rsplit('-',1)[0],'kind':'auto','variant':'upscale','file':rid+'-auto-upscale.png'})
    sheet.save(root/'difficult-crops.png');(root/'diagnostic-inputs.json').write_text(json.dumps(diagnostic,indent=2))
if __name__=='__main__':main(Path(sys.argv[1]))
