# Trimax Engineering Standard

Trimax is in Stabilization Mode. Do not add new features unless they directly support approved invoice, PDF, or mobile fixes. Every change should reduce confusion, prevent regressions, and preserve existing workflows.

## Engineering Principles

- Prefer root-cause fixes over surface patches.
- Reuse existing pages, components, data structures, and workflows before adding anything new.
- Keep changes scoped. Do not redesign unrelated areas while fixing a focused problem.
- Preserve owner, manager, technician, estimate, invoice, queue, payment, and proof flows unless the task explicitly targets them.
- Treat mobile, PDF, split invoices, and send workflows as high-risk areas.

## Priority Order

1. Data integrity
2. Correct business behavior
3. Reliability
4. Simplicity
5. Performance
6. Visual polish

## Architecture Philosophy

- Prefer extending existing systems over introducing new ones.
- One robust system is preferable to multiple overlapping systems.
- Every new abstraction should remove complexity rather than create it.

## Root Cause Analysis

- Before editing, identify where the behavior starts: UI state, route/query handling, data loading, component CSS, API route, database data, or PDF generation.
- If a bug appears in one invoice type, check normal invoices, split invoices, sent/draft/paid states, and mobile layout before assuming it is isolated.
- If the same bug appears more than once, stop implementing fixes and investigate the shared architecture before continuing.
- Do not create duplicate systems to bypass a bug. Repair the existing system unless it is clearly obsolete.

## Definition of Done

- The requested behavior works in the intended workflow.
- The change does not break nearby workflows.
- Lint and build pass when code changes are made.
- Mobile portrait remains usable.
- Errors, empty states, and loading states remain readable.
- Invoice-related work is verified against normal invoices, split invoices, PDF output, and mobile portrait layout.

## Deployment & Completion Rules

A task is not considered complete until all of the following are true:

1. The implementation is complete.
2. The code is committed to Git.
3. The commit has been pushed to GitHub.
4. Production has been deployed successfully.
5. The production URL is serving the new deployment.
6. The developer explicitly states whether the feature exists:
   - Locally only
   - Committed
   - Pushed
   - Deployed
   - Verified in production
7. Never report "fixed," "implemented," "complete," or "verified" if the feature exists only as local uncommitted changes.
8. If work stops before deployment, explicitly state:
   - The changes are local only.
   - The production application does not contain these changes.
   - The user should not test production yet.
9. When deployment completes, provide:
   - Commit hash
   - GitHub push confirmation
   - Deployment ID
   - Deployment URL
   - Confirmation that the production domain points to the new deployment.
10. For production-impacting features, completion requires successful real-world testing by the user. Until then, the task status should be "Awaiting User Acceptance."

## Shared Components

- Use shared components and existing patterns for buttons, cards, filters, forms, modals, command actions, proof logs, and send panels.
- Do not create duplicate command boxes, invoice send flows, PDF templates, status systems, timelines, or activity logs.
- If a shared component causes a bug, improve the shared component carefully rather than patching each page separately.

## Performance

- Avoid unnecessary full-page reloads when state changes can update in place.
- Keep lists, dashboards, and command results focused so the app feels fast on mobile.
- Do not add heavy client logic, duplicate queries, or broad data fetches unless they are needed for the workflow.
- Background work such as PDF refresh should not block the user from continuing normal app use.

## User Experience Philosophy

- Trimax should feel like an operations assistant, not a record archive.
- Important actions should be obvious. Irreversible or destructive actions must require confirmation. Routine business workflows should not require unnecessary previews or confirmations.
- The software should anticipate the user's next action and complete safe work automatically whenever possible.
- Every page must work on iPhone portrait with no horizontal overflow.
- Toasts and errors must wrap and remain fully visible.
- Modals and cards must scroll vertically if content is taller than the screen.
- Keep copy plain, owner-friendly, and direct.

## Invoice, PDF, and Send Rules

- PDFs must use dedicated print/PDF CSS and must not inherit mobile app layout rules.
- Customer-facing PDFs should match the official full-page customer document layout.
- Send Invoice must auto-generate or refresh the PDF in the background.
- Preview PDF must be optional only.
- Split invoice groups must be sendable with one action.
- Sending must log proof and show clear success or failure.

## Regression Prevention

- Before finishing invoice-related changes, verify normal invoices, split invoices, PDF output, and mobile portrait layout.
- Before finishing mobile layout changes, check that cards, forms, filters, toasts, and modals do not overflow.
- Before finishing command or routing changes, verify action intent outranks fuzzy record search only where appropriate.
- Leave unrelated dirty files untouched.
