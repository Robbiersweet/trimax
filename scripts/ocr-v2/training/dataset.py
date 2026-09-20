"""Private dataset construction. No OCR, database queries, or production imports."""
import argparse, hashlib, json, random, re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

VERSION = 'trimax-invoice-dataset-v1'
def digest(data): return hashlib.sha256(data).hexdigest()
def validate(samples):
    ids=set(); groups={}; hashes={}; originals={}; by_id={s['sampleId']:s for s in samples}
    for s in samples:
        assert re.fullmatch(r'[A-Za-z0-9_-]+',s['sampleId']), 'Unsafe sample id'
        assert s['sampleId'] not in ids, 'Duplicate sample id'; ids.add(s['sampleId'])
        assert s['split'] in ('train','validation','heldout')
        assert s['verifiedLabel'] and s['transcription'], 'Unverified transcription'
        g=s['sourceDocumentReference']
        if s['kind']=='real':
            assert s.get('sourceOriginalHash'), 'Original identity required'
            assert originals.setdefault(s['sourceOriginalHash'],s['split'])==s['split'], 'Recapture/derivative original leakage'
        assert groups.setdefault(g,s['split'])==s['split'], 'Source-document leakage'
        assert hashes.setdefault(s['sha256'],s['split'])==s['split'], 'Identical-image leakage'
        if s.get('parentSampleId'):
            parent=by_id[s['parentSampleId']]
            assert parent['split']=='train' and s['split']=='train', 'Only training samples may be augmented'
            assert parent['sourceDocumentReference']==g, 'Augmentation provenance mismatch'
            assert parent['transcription']==s['transcription'], 'Augmentation changed label'
        if s.get('protectedFixture')=='B': assert s['split']=='heldout', 'Fixture B leakage'
    return True

def training_gate(samples):
    validate(samples)
    # Conservative pilot prerequisites, not an assertion of statistical sufficiency.
    real=[s for s in samples if s['kind']=='real' and not s.get('parentSampleId')]
    counts={split:len({s['sourceDocumentReference'] for s in real if s['split']==split}) for split in ('train','validation','heldout')}
    return {'ready':counts['train']>=20 and counts['validation']>=5 and counts['heldout']>=5, 'realDocuments':counts, 'minimumPilotDocuments':{'train':20,'validation':5,'heldout':5}}

def build(private_root, output, repo):
    output=output.resolve(); assert not output.is_relative_to(repo.resolve()), 'Private dataset must be outside repository'
    output.mkdir(parents=True,exist_ok=True)
    samples=[]; labels=json.loads((repo/'scripts/ocr-v2/labels.json').read_text())['B']
    phase3=json.loads((private_root/'phase3-B/observations.json').read_text())
    source=private_root/'phase2-B/document-color.png'; original=private_root/'fixture-b-original.jpg'
    manifest=json.loads((private_root/'manifest.json').read_text())
    assert digest(original.read_bytes())==manifest['fixtures']['B']['sha256']
    assert digest(source.read_bytes())==json.loads((private_root/'layout-B-annotation.json').read_text())['imageSha256']
    with Image.open(source) as image:
        for i,c in enumerate(c for c in phase3['crops'] if c['field']=='invoice'):
            b=c['bounds']; sample_id='B-'+c['rowId']; dest=output/'heldout'/(sample_id+'.png');dest.parent.mkdir(exist_ok=True)
            image.crop((b['left'],b['top'],b['left']+b['width'],b['top']+b['height'])).save(dest)
            samples.append({'sampleId':sample_id,'kind':'real','sourceAttemptId':None,'sourceDocumentReference':'fixture-b-document','sourceOriginalHash':digest(original.read_bytes()),'rowId':c['rowId'],'cropReference':str(dest.relative_to(output)),'cropBounds':b,'transcription':labels['invoices'][i],'verifiedLabel':True,'labelProvenance':'Explicit user-verified physical remittance truth, Phase 3C request; not derived from OCR','templateId':'printed-remittance-B','qualityMetadata':{'faintness':'high','blur':'soft glyph edges','shadows':'visible uneven background','wrinkles':'visible','orientation':'upright normalized','cameraDistance':'unknown','originalResolution':[4032,3024],'originalExif':6,'cropResolution':[b['width'],b['height']]},'split':'heldout','protectedFixture':'B','sha256':digest(dest.read_bytes())})
    fonts=[Path('C:/Windows/Fonts')/n for n in ('arial.ttf','times.ttf','cour.ttf','calibri.ttf')];fonts=[f for f in fonts if f.exists()];assert fonts
    rng=random.Random(31032026); reserved=set(labels['invoices']);tokens=[]
    while len(tokens)<1200:
        token='INV-'+str(rng.randrange(1,15000)).zfill(4)
        if token not in reserved and token not in tokens:tokens.append(token)
    for i,token in enumerate(tokens):
        split='train' if i<1000 else 'validation';fontpath=fonts[i%len(fonts)];size=rng.randrange(22,39);font=ImageFont.truetype(str(fontpath),size)
        spacing=rng.choice([0,0,1,2]);width=round(sum(font.getlength(c) for c in token)+(len(token)-1)*spacing)+24;height=60
        bg=rng.randrange(227,256);ink=rng.randrange(55,195);im=Image.new('L',(width,height),bg);draw=ImageDraw.Draw(im);x=12
        for char in token:draw.text((x,10),char,font=font,fill=ink,stroke_width=1 if i%9==0 else 0);x+=font.getlength(char)+spacing
        blur=rng.choice([0,.25,.45,.65]);im=im.filter(ImageFilter.GaussianBlur(blur))
        angle=rng.uniform(-1.1,1.1);im=im.rotate(angle,resample=Image.Resampling.BICUBIC,fillcolor=bg)
        # Mild horizontal shadow gradient and JPEG quantization.
        shadow=rng.uniform(0,.10);pixels=im.load()
        for x in range(width):
            factor=1-shadow*x/max(1,width-1)
            for y in range(height):pixels[x,y]=round(pixels[x,y]*factor)
        dest=output/split/(f'synthetic-{i:04d}.jpg');dest.parent.mkdir(exist_ok=True);quality=rng.randrange(75,96);im.save(dest,quality=quality)
        dest.with_suffix('.gt.txt').write_text(token+'\n',encoding='utf8')
        samples.append({'sampleId':f'synthetic-{i:04d}','kind':'synthetic','sourceDocumentReference':'synthetic-'+token,'sourceAttemptId':None,'rowId':None,'cropReference':str(dest.relative_to(output)),'transcription':token,'verifiedLabel':True,'labelProvenance':'Deterministic renderer ground truth','templateId':'synthetic-'+fontpath.stem,'qualityMetadata':{'font':fontpath.name,'fontSize':size,'ink':ink,'background':bg,'blur':blur,'angle':angle,'spacing':spacing,'shadow':shadow,'jpegQuality':quality},'split':split,'sha256':digest(dest.read_bytes())})
    validate(samples)
    for s in samples:
        assert digest((output/s['cropReference']).read_bytes())==s['sha256']
    summary={}
    for split in ('train','validation','heldout'):
        ss=[s for s in samples if s['split']==split];real=[s for s in ss if s['kind']=='real']
        summary[split]={'realDocuments':len({s['sourceDocumentReference'] for s in real}),'realCrops':len(real),'realTokens':len({s['transcription'] for s in real}),'realTemplates':len({s['templateId'] for s in real}),'syntheticCrops':len(ss)-len(real)}
    result={'version':VERSION,'benchmarkVersion':'ocr-v2-phase3c-v1','samples':samples,'summary':summary,'gate':training_gate(samples),'model':{'name':'trimax_invoice','version':'trimax-invoice-v1','status':'not-trained-insufficient-independent-real-data'},'fixtureBPolicy':'heldout; previously used for preprocessing studies, not a pristine blind test','augmentedRealSamples':0}
    content=json.dumps(result,indent=2).encode();(output/'dataset.json').write_bytes(content);(output/'dataset.sha256').write_text(digest(content)+'\n')
    print(json.dumps({'summary':summary,'gate':result['gate'],'datasetHash':digest(content)},indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('private_root',type=Path);p.add_argument('output',type=Path);a=p.parse_args();build(a.private_root,a.output,Path(__file__).resolve().parents[3])
