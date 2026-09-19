# Physical OCR orientation and optical evidence

This is an optical-layer repair. Matching, totals, duplicate semantics, eligibility and payment application are unchanged. Golden A–E remain the business-resolution contract. The exact EXIF fault in historical attempt 286a7eab cannot be reconstructed; its original bytes were not retained.

## Pipeline

Original JPEG -> read numeric EXIF Orientation (1–8) -> neutralize that tag BEFORE browser decoding -> apply exactly one explicit EXIF matrix -> metadata-free JPEG -> one lightweight 0/90/180/270 sparse-text probe -> orient pixels using credible document structure -> existing detector crop/full-still comparison -> exact shared preview/OCR JPEG.

The video fallback receives its own probe before detailed OCR. Missing EXIF uses identity until document evidence resolves the angle. Partial four-angle probes, ambiguous top candidates, or no credible structure remain unresolved and cannot enter detailed payment OCR automatically. No fixed device-specific rotation exists. Existing camera-guide mapping is unchanged.

Probe images have a maximum edge of 1500; four short passes share one worker. A 16-second probe budget and 4-second per-pass ceiling do not extend the existing detailed OCR budget. Probe angles, texts, score breakdowns and duration are retained. Detailed OCR records its own total and recovery duration. Punctuation/noise cannot gain a useful score from confidence alone.

## Retention

The original JPEG, EXIF/document-normalized image, and exact final OCR image are attached to the existing attempt outbox. A database trigger separates them into `ocr_attempt_optical`, keyed to the diagnostic row; its deletion cascades image deletion. The existing 30-day expiry, owner/admin RLS and pin policy apply. Clean-success completion deletes the diagnostic parent and images. No permanent diagnostic image bucket or second attempt-history system exists.

Optical bytes are capped at 11 million base64 characters (about 8.25 MB binary) plus small metadata per attempt. Over-budget images are explicitly marked omitted; final OCR input has priority. Typical retained attempts should use roughly 6–10 MB of base64 storage depending on the original JPEG, capped near 11 MB. At 100 failed/review attempts per day, 30 days is roughly 18–30 GB before database compression, with pinned cases additional. Actual submitted-payment canonical images remain unchanged.

The raw original JPEG may contain camera EXIF; it is owner/admin-only. Only numeric Orientation and transform metadata are extracted into text diagnostics. No GPS/device metadata is copied into summary fields.

## Inspection

Optical Evidence is collapsed and fetched separately on expansion. List queries and ordinary diagnostics do not fetch image bytes. Older attempts display an unavailable message; no reconstruction is fabricated. Browser rendering of original JPEGs may honor their original EXIF; compare the explicitly normalized and final images to assess the actual OCR orientation.

## Validation and limits

`ocr-optical-regression.ts` uses generated raster JPEGs and actual Tesseract for all four pixel rotations, EXIF rotation, already normalized JPEG, missing EXIF, five invoice identifiers and total recognition. These are separate from unchanged golden fixtures. React tests cover lazy optical fetching and raster-only bounded retention. SQL rollback tests cover extraction, clean-success deletion, pinning and expiry cascades. Real iPhone decoding/camera behavior still requires ONE physical acceptance test; passing generated-image tests does not declare OCR stabilized.
