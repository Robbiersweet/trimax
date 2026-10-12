# R&L public website — business content handoff

The website uses the approved R&L badge, workshop image, Allura script and orange/charcoal/ivory design. No testimonials, certifications, prices, private contacts or project photographs were invented.

## Business input before public cutover

- **Public contact / privacy contact:** confirm the phone and/or email R&L wants published. `sites/rnl/lib/content.ts` intentionally leaves both blank. No internal account contact was reused. Confirm how customers can request corrections or deletion of request information, and the business's retention practice before approving the privacy notice.
- **Privacy and request wording:** review `/privacy` and `/request-terms` for the actual business practices. They describe request-only intake, no automatic appointments and no payment collection; they are not a legal compliance certification.
- **Cutover authorization and account access:** approve the final website after review; the DNS account and production-only credentials/configuration must be available for a separately authorized cutover. No secret belongs in this document or chat.

## Optional content, not blockers for an honest initial site

- Approved real project photographs, with permission to publish. Supply category, a brief factual caption and useful alt text. Populate the `gallery` array in `sites/rnl/lib/content.ts`; put image files in the website public assets. Current slots explicitly say photos are coming soon. They are not fake completed projects.
- Preferred service-area wording. The current copy asks for the project location and promises only to confirm whether R&L can help; no geographic coverage was invented.
- Refine service descriptions if desired. Current categories follow the supplied brief: apartment turns, interior painting, carpentry/repairs, fences, home maintenance and property-manager support. Form choices remain the existing scheduling configuration.
- Additional verified company story. Current About copy uses only established 2020 and the supplied capabilities.
- Testimonials only if genuine, approved and attributed with permission. None are displayed.

## Editing locations

Navigation, service cards, gallery and public contact configuration: `sites/rnl/lib/content.ts`. Page-specific narrative: `sites/rnl/app/<page>/page.tsx`. Brand and responsive styles: `sites/rnl/app/site.css`. The original shared scheduling form/security source remains under `src/app/book` and `src/app/lib/publicScheduling`; do not edit generated `.shared` files.

Next action: WAIT FOR CHATGPT REVIEW.
