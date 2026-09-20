"""Fail-closed dataset intake and train-only augmentation utilities."""
import hashlib, json
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter
from dataset import validate, training_gate

def import_reviewed(records, dataset_root):
    root=Path(dataset_root);manifest=json.loads((root/'dataset.json').read_text());samples=manifest['samples']
    for record in records:
        assert record.get('verifiedLabel') and record.get('verifiedBy') and record.get('verificationReference'), 'Independent verification required'
        assert record.get('sourceDocumentReference') and record.get('sourceOriginalHash'), 'Original document provenance required'
        assert record['kind']=='real' and record['split'] in ('train','validation','heldout')
        source=Path(record['sourceFile']).resolve();data=source.read_bytes();sha=hashlib.sha256(data).hexdigest()
        assert sha==record['sha256'], 'Source hash mismatch'
        dest=root/'intake'/(sha+'.png');dest.parent.mkdir(exist_ok=True)
        candidate={**record,'cropReference':str(dest.relative_to(root))};candidate.pop('sourceFile')
        validate(samples+[candidate]);dest.write_bytes(data);samples.append(candidate)
    manifest['gate']=training_gate(samples)
    manifest['summary']={}
    for split in ('train','validation','heldout'):
        rows=[s for s in samples if s['split']==split];real=[s for s in rows if s['kind']=='real']
        manifest['summary'][split]={'realDocuments':len({s['sourceDocumentReference'] for s in real}),'realCrops':len(real),'realTokens':len({s['transcription'] for s in real}),'realTemplates':len({s['templateId'] for s in real}),'syntheticCrops':len(rows)-len(real)}
    blob=json.dumps(manifest,indent=2).encode();(root/'dataset.json').write_bytes(blob);(root/'dataset.sha256').write_text(hashlib.sha256(blob).hexdigest()+'\n')

def augment_training(sample, root):
    assert sample['split']=='train' and sample['kind']=='real' and not sample.get('protectedFixture'), 'Real training parents only'
    root=Path(root);source=root/sample['cropReference'];results=[]
    with Image.open(source) as image:
        for name,derived in [('brightness',ImageEnhance.Brightness(image).enhance(1.04)),('mild-blur',image.filter(ImageFilter.GaussianBlur(.25)))]:
            dest=root/'augmented'/(sample['sampleId']+'-'+name+'.png');dest.parent.mkdir(exist_ok=True);derived.save(dest)
            results.append({**sample,'sampleId':sample['sampleId']+'-'+name,'parentSampleId':sample['sampleId'],'augmentation':name,'cropReference':str(dest.relative_to(root)),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()})
    return results
