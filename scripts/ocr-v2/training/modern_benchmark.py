"""One fixed offline PP-OCRv5 English recognition benchmark after pilot failure.

No model tuning, detection, matching, or production integration. Images never
leave this machine. Only published model weights are downloaded on first use.
"""
import argparse
import hashlib
import importlib.metadata
import json
import time
from pathlib import Path

import cv2
import rapidocr
from rapidocr import EngineType, LangRec, ModelType, OCRVersion
from rapidocr.ch_ppocr_rec import TextRecognizer, TextRecInput
from rapidocr.utils.parse_parameters import ParseParams
from pilot_train import edits


def main(root):
    assert (root/'holdout-complete.json').exists(), 'Finish sealed Tesseract holdout first'
    cfg = ParseParams.load(Path(rapidocr.__file__).parent/'config.yaml')
    cfg = ParseParams.update_batch(cfg, {'Rec.engine_type':EngineType.ONNXRUNTIME,
        'Rec.lang_type':LangRec.EN, 'Rec.model_type':ModelType.MOBILE, 'Rec.ocr_version':OCRVersion.PPOCRV5,
        'EngineConfig.onnxruntime.intra_op_num_threads':4, 'EngineConfig.onnxruntime.inter_op_num_threads':1})
    cfg.Rec.engine_cfg = cfg.EngineConfig.onnxruntime
    cfg.Rec.font_path = None
    cfg.Rec.model_root_dir = str(root/'modern-models')
    began = time.perf_counter()
    recognizer = TextRecognizer(cfg.Rec)
    init_seconds = time.perf_counter()-began
    rows = json.loads((root/'holdout-fixed/inputs.json').read_text())
    # Download/init can fail before this marker; no inference has happened yet.
    with (root/'modern-benchmark-started.json').open('x') as f:
        json.dump({'model':'PP-OCRv5 English mobile, fixed before inference', 'time':time.time()}, f)
    result_rows = []
    for row in rows:
        file = root/'holdout-fixed'/row['file']
        assert hashlib.sha256(file.read_bytes()).hexdigest() == row['sha256']
        start = time.perf_counter()
        result = recognizer(TextRecInput(img=cv2.imread(str(file))))
        raw = result.txts[0] if result.txts else ''
        observed = ''.join(raw.upper().split())
        result_rows.append({**row, 'raw':raw, 'observed':observed, 'exact':observed==row['label'],
                            **edits(row['label'], observed), 'confidence':float(result.scores[0]),
                            'ms':(time.perf_counter()-start)*1000})
    report = {'model':'PP-OCRv5 English mobile', 'rapidocr':importlib.metadata.version('rapidocr'),
              'onnxruntime':importlib.metadata.version('onnxruntime'), 'initIncludingDownloadSeconds':init_seconds,
              'rows':result_rows, 'exact':sum(r['exact'] for r in result_rows),
              'characterAccuracy':1-sum(r['distance'] for r in result_rows)/sum(r['characters'] for r in result_rows),
              'fiveRowInferenceMs':sum(r['ms'] for r in result_rows),
              'scope':'Exploratory offline fixed-model comparison after Tesseract holdout; no training or B-driven tuning',
              'weights':[{'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in (root/'modern-models').glob('*.onnx')]}
    (root/'modern-fixture-b.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('root', type=Path)
    main(parser.parse_args().root)
