# Visual organization identity consensus

This worker-only layer recognizes labeled property/customer/payor cells using the already loaded SVTRv2, PARSeq and PP-OCRv5 adapters. It accepts no business snapshot or expected name. Invoice, amount, total, residual and resolver contracts are unchanged. Existing full-page and focused Tesseract observations remain diagnostic evidence; their low scores are not inflated.

## Authority contract

- Generic NFKC, case, punctuation and spacing normalization. Joined text corroborates exactly matching letters from a spaced observation; it cannot supply missing characters.
- A visible trailing descriptor may be classified against apartments, holdings, properties, management, services, LLC, Inc, corporation or company. Partial classification requires at least five letters and no more than three missing terminal letters. The raw partial descriptor is retained; the class is not an OCR transcription.
- A candidate needs an alphabetic distinctive stem of at least six letters and visible descriptor evidence. Single short tokens, descriptors alone and unsupported names stay review-required. This is a conservative evidence rule, not a statistical probability.
- At least two distinct mature recognizers must each repeat the exact stem in at least two independent, nonoverlapping labeled regions. Repeated passes, copied crop hashes and overlapping crops do not increase independent region count.
- Conflicting same-crop reruns block authority. A competing stem with two-model support blocks, even at edit distance one. A distant competing labeled stem also blocks. A repeated two-model unclassified competing organization blocks. A single-engine one-glyph disagreement stays visible but does not override two independent agreeing engines.
- Distinct descriptor classes cannot silently merge. No suffix completion or client aliases occur.
- Only the observed stem is passed to the existing business resolver. Business matching occurs afterward. Shadow remains non-authoritative for payment; paymentCanApply is always false.

## Provenance and performance

Each observation stores original text, normalized text/tokens, recognizer, nullable confidence, duration, source hash, crop hash, label type, row and geometry. Ledger entries are append-only and include consensus/descriptor/reason/conflict metadata. Full original semantic observations remain unchanged. No new model initialization is added: identity crops are processed in the existing model batch after invoice/money crops.

Run `scripts/ocr-v2/organization-identity-regression.cjs` for vendor-neutral positive and negative cases. `organization-retained.cjs` takes the private mature-money benchmark root, retained fixture descriptor and saved paired diagnostics. It performs fresh inference, then checks the unchanged invoice outputs/crops, money, residual, total, distinct assignments and disabled payment authority. Labels enter only after inference. Private evidence is not committed.

The private eight-document dataset gate checks historical extraction regression; it is not fresh physical acceptance or a measurement of this new identity layer's generalization. Fresh physical acceptance remains required before any promotion to payment authority.
