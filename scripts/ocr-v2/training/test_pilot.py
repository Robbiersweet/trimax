"""Tests for scoring and corpus isolation; no held-out pixel access."""
import random
import tempfile
import unittest
from pathlib import Path
from pilot_train import edits, main as train
from pilot_corpus import render


class PilotTests(unittest.TestCase):
    def test_substitution(self):
        self.assertEqual(edits('INV-0001', 'INV-O001')['substitutions'], 1)

    def test_insertion(self):
        self.assertEqual(edits('INV-0001', 'IINV-0001')['insertions'], 1)

    def test_deletion(self):
        self.assertEqual(edits('INV-0001', 'INV0001')['deletions'], 1)

    def test_no_implicit_hyphen_fix(self):
        self.assertEqual(edits('INV-0001', 'INV0001')['distance'], 1)

    def test_empty(self):
        self.assertEqual(edits('INV-0001', '')['deletions'], 8)

    def test_training_is_sealed_after_holdout(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root/'holdout-started.json').write_text('{}')
            with self.assertRaisesRegex(ValueError, 'sealed'):
                train(root, root/'absent-harvest')

    def test_render_reproducible(self):
        fonts = list(Path('/usr/share/fonts/truetype/liberation').glob('*.ttf'))
        if not fonts: self.skipTest('Ubuntu font absent')
        a, af = render('INV-1234', fonts[0], random.Random(1))
        b, bf = render('INV-1234', fonts[0], random.Random(1))
        self.assertEqual(a.tobytes(), b.tobytes()); self.assertEqual(af, bf)


if __name__ == '__main__': unittest.main()
