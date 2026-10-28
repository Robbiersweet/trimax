# Office QR and winter coupon intake — active checkpoint

Base production: RC4 source 690d426, metadata handoff 49f54d6. Production unchanged.
Core: codex/office-coupon-intake. Website: codex/office-coupon-website.
One primary agent. Existing fixed-unit QR and financial/privacy workflows preserved.

Verified: all 16 QR symbols in the two original winter coupon PDFs decode to
/schedule?promo=WINTER25 or WINTER100 on rnlcreations.com. Originals unchanged.
North Creek has three assignment rows, one saved property client/service address;
choices must group assignments, not delete them. Private inventory/decode evidence:
%LOCALAPPDATA%/Trimax/invoice-lifecycle-20261026/office-coupon-20261028.

In progress: one additive office-QR migration using existing QR tables; saved-address
resolution, one active property ID, atomic replace, mandatory unit, owner-approved
Queue location, explicit verified-fixture metadata. UI/navigation and coupon notes
propagation are being implemented. Not installed or deployed. No hosted acceptance
claimed yet. Customer SMS/email remain disabled. Existing production is intact.

Remaining: targeted SQL/UI tests, website canonical packaging, isolated lab install
and hosted acceptance, compatibility/backup/recovery and unchanged release gates;
then production rollout within authorized scope or one consolidated mandatory
approval if the established release process requires it. No printed/iPhone scan
acceptance has been performed for the new office card.
