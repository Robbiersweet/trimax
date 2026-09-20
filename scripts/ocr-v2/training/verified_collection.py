"""Private post-verification intake. Copies/hashes/crops automatically; never authorizes training.

Consumes a trusted verification export supplied by an operator, not OCR predictions.
No production writes and no production event hook while OCR v2 is inactive.
"""
import argparse,hashlib,json,re
from pathlib import Path
from PIL import Image

def collect(record,root):
    assert record.get('paymentVerified') is True and record.get('verifiedBy') and record.get('verificationReference'),'Verified payment evidence required'
    assert record.get('canonicalRemittanceReference') and record.get('templateMetadata'),'Document identity and template metadata required'
    root=Path(root).resolve();repo=Path(__file__).resolve().parents[3]
    assert not root.is_relative_to(repo),'Private storage must be outside repository'
    source=Path(record['canonicalImage']);data=source.read_bytes();digest=hashlib.sha256(data).hexdigest()
    assert digest==record['canonicalImageSha256'],'Canonical hash mismatch'
    rows=record['rows'];assert rows and len({r['rowId'] for r in rows})==len(rows),'Unique physical row identities required'
    with Image.open(source) as image:
        image.load()
        for row in rows:
            assert row.get('labelVerified') is True and row.get('invoiceLabel') and isinstance(row.get('amountCents'),int),'Verified row labels and amounts required'
            assert re.fullmatch(r'[A-Za-z0-9_-]+',row['rowId']),'Unsafe row identifier'
            x,y,w,h=row['cropBounds'];assert min(x,y)>=0 and min(w,h)>0 and x+w<=image.width and y+h<=image.height,'Crop out of bounds'
        target=root/digest;target.mkdir(parents=True,exist_ok=True)
        document={**record,'canonicalImage':'original','trainingInclusion':'unassigned','documentSha256':digest}
        existing=target/'record.json'
        if existing.exists():
            previous=json.loads(existing.read_text());assert previous['verificationReference']==record['verificationReference'] and previous['rows']==rows,'Conflicting verification requires explicit review'
            return target
        (target/'original').write_bytes(data)
        for row in rows:
            x,y,w,h=row['cropBounds'];file=row['rowId']+'.png';image.crop((x,y,x+w,y+h)).save(target/file)
        document['cropReferences']={r['rowId']:r['rowId']+'.png' for r in rows}
        existing.write_text(json.dumps(document,indent=2))
        return target

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('verified_export',type=Path);p.add_argument('private_root',type=Path);a=p.parse_args()
    for record in json.loads(a.verified_export.read_text()):print(collect(record,a.private_root))
