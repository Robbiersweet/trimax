import tempfile,unittest,hashlib
from pathlib import Path
from PIL import Image
import torch
from sequence_model import CHARS,CRNN,decode,tensor
from verified_collection import collect

class Contracts(unittest.TestCase):
    def test_model_shape(self):
        self.assertEqual(tuple(CRNN()(tensor(Image.new('L',(90,20),255))[None]).shape),(1,48,len(CHARS)+1))
    def test_reject_only_grammar(self):
        for text in ['INV-1234','INV1234','INV-12','4404']:
            sequence=[]
            for c in text:sequence.extend([CHARS.index(c)+1,0])
            logits=torch.full((1,len(sequence),len(CHARS)+1),-20.)
            for i,c in enumerate(sequence):logits[0,i,c]=20
            result=decode(logits)[0];self.assertEqual(result['raw'],text)
            self.assertEqual(result['constrained'],text if text=='INV-1234' else None)
    def test_private_verified_collection(self):
        with tempfile.TemporaryDirectory() as tmp:
            image=Path(tmp)/'source.png';Image.new('L',(100,50),255).save(image)
            record={'paymentVerified':True,'verifiedBy':'test-reviewer','verificationReference':'test-proof','canonicalRemittanceReference':'test-document','templateMetadata':{'class':'test'},'canonicalImage':str(image),'canonicalImageSha256':hashlib.sha256(image.read_bytes()).hexdigest(),'rows':[{'rowId':'row-1','labelVerified':True,'invoiceLabel':'INV-1234','amountCents':100,'cropBounds':[1,1,60,20]}]}
            target=collect(record,Path(tmp)/'private');self.assertTrue((target/'row-1.png').exists());self.assertEqual(target,collect(record,Path(tmp)/'private'))
            record['paymentVerified']=False
            with self.assertRaises(AssertionError):collect(record,Path(tmp)/'private')

if __name__=='__main__':unittest.main()
