import json, sys, tempfile, unittest
from pathlib import Path
from dataset import validate, training_gate
from intake import augment_training
class Integrity(unittest.TestCase):
    def sample(self, name='a',split='train'):
        return dict(sampleId=name,split=split,kind='real',verifiedLabel=True,transcription='INV-8294',sourceDocumentReference='doc-'+name,sourceOriginalHash='original-'+name,sha256='hash-'+name)
    def test_valid(self): self.assertTrue(validate([self.sample()]))
    def test_source_leak(self):
        a=self.sample();b=self.sample('b','heldout');b['sourceDocumentReference']=a['sourceDocumentReference']
        with self.assertRaises(AssertionError):validate([a,b])
    def test_image_leak(self):
        a=self.sample();b=self.sample('b','heldout');b['sha256']=a['sha256']
        with self.assertRaises(AssertionError):validate([a,b])
    def test_original_leak_under_new_name(self):
        a=self.sample();b=self.sample('b','heldout');b['sourceOriginalHash']=a['sourceOriginalHash']
        with self.assertRaises(AssertionError):validate([a,b])
    def test_holdout(self):
        a=self.sample();a['protectedFixture']='B'
        with self.assertRaises(AssertionError):validate([a])
    def test_unverified(self):
        a=self.sample();a['verifiedLabel']=False
        with self.assertRaises(AssertionError):validate([a])
    def test_augment_holdout(self):
        with self.assertRaises(AssertionError):augment_training(self.sample('b','heldout'),Path(tempfile.gettempdir()))
    def test_parent(self):
        a=self.sample('a','heldout');b=self.sample('b');b['parentSampleId']='a'
        with self.assertRaises(AssertionError):validate([a,b])
    def test_synthetic_cannot_open_gate(self):
        rows=[{**self.sample(str(i)),'kind':'synthetic'} for i in range(100)]
        self.assertFalse(training_gate(rows)['ready'])
    def test_current_dataset(self):
        if len(sys.argv)>1 and sys.argv[-1].endswith('.json'):return
        import os, hashlib
        root=Path(os.environ['LOCALAPPDATA'])/'Trimax/ocr-v2-training/trimax-invoice-dataset-v1';r=json.loads((root/'dataset.json').read_text());validate(r['samples'])
        heldout={s['transcription'] for s in r['samples'] if s['split']=='heldout'}
        self.assertEqual(len(heldout),5)
        self.assertFalse(heldout&{s['transcription'] for s in r['samples'] if s['split']=='train'})
        self.assertFalse(training_gate(r['samples'])['ready'])
        for s in r['samples']:self.assertEqual(hashlib.sha256((root/s['cropReference']).read_bytes()).hexdigest(),s['sha256'])
if __name__=='__main__':unittest.main()
