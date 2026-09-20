import unittest
import numpy as np
from PIL import Image
from ppocr_phase3d import decode,prepare

class RecognitionContracts(unittest.TestCase):
    def test_ctc_preserves_missing_digits(self):
        chars=['blank']+list('INV-0123456789')
        for text in ['INV-0519','INV6665','INV14','404','INV0513']:
            indices=[]
            for c in text:indices.extend([chars.index(c),0])
            scores=np.zeros((1,len(indices),len(chars)))
            for i,c in enumerate(indices):scores[0,i,c]=1
            self.assertEqual(decode(scores,chars),[text])
    def test_repeat_collapse_requires_blank(self):
        chars=['blank','1'];scores=np.array([[[0,1],[0,1],[1,0],[0,1]]])
        self.assertEqual(decode(scores,chars),['11'])
    def test_preparation_preserves_source(self):
        source=Image.new('RGB',(140,25),(220,210,200));original=source.tobytes();prepared=prepare(source)
        self.assertEqual(prepared.shape,(3,48,320));self.assertEqual(prepared.dtype,np.float32)
        self.assertEqual(source.tobytes(),original);self.assertTrue(np.isfinite(prepared).all())

if __name__=='__main__':unittest.main()
