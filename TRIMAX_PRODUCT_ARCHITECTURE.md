# Trimax Product Architecture

This document defines the product philosophy for Trimax. It should guide future feature decisions, page organization, workflow design, and automation choices.

## 1. Core Vision

Trimax is an Operations Assistant.

It is not simply an operations database.

Every feature should reduce work. Whenever possible, Trimax should:

- remind
- automate
- suggest
- organize

instead of requiring manual tracking.

Trimax should help the owner see what matters, act faster, and avoid reconstructing the business from scattered records.

## 2. Product Principles

One screen should answer one primary question.

- Dashboard: "What needs my attention?"
- Queue: "What should I work on next?"
- Queue Detail: "Everything about this apartment."
- Priority Planner: "In what order should work be completed?"
- Estimates: "What should I charge?"
- Invoices: "What has been billed?"
- Recurring Invoices: "What should happen automatically?"
- Services: "What work do we offer, and what does it usually cost?"
- Activity / Proof: "What happened, when, and who did it?"

If a screen starts answering too many questions, split the workflow or hide low-frequency details behind progressive disclosure.

## 3. Manager vs Owner Responsibilities

Manager responsibilities:

- requests
- move-out information
- property deadlines
- requested priority
- notes
- photos
- visible updates needed from the property side

Owner/Admin responsibilities:

- internal schedule
- Robbie ETA / projected completion
- progress
- delays
- completion
- financial decisions
- estimate, invoice, payment, and proof workflows

Never merge these responsibilities.

Managers communicate what the property needs. Owner/Admin decides how the work is planned, priced, completed, billed, and documented.

## 4. Workflow Philosophy

Trimax workflows should move naturally through:

Intake

to

Operations

to

Finance

to

History

Every feature should fit clearly into one of these areas.

- Intake captures requests and property information.
- Operations plans and completes the work.
- Finance turns completed work into estimates, invoices, payments, and deposits.
- History preserves proof, decisions, activity, and outcomes.

When a feature does not fit, reconsider whether it belongs in Trimax or whether it should be simplified.

## 5. Queue Philosophy

Queue answers:

"What should I work on next?"

Queue is the operational dashboard for active work. It should make priorities, deadlines, blockers, lifecycle state, and next actions obvious without forcing the user to open every item.

Queue Detail tells the complete operational story for one apartment.

Priority Planner determines work order.

History records what happened.

Queue should not become an invoice page, accounting report, or archive. It should show enough lifecycle status to guide operations, then hand off to the correct workspace when deeper finance or proof detail is needed.

## 6. UI Philosophy

Reduce cognitive load.

Prefer workflows over forms.

Prefer business language over technical language.

Use progressive disclosure:

- show common decisions first
- hide advanced fields until needed
- keep low-frequency metadata out of the main workflow
- avoid duplicate cards, duplicate sections, and repeated summaries

Important actions should be obvious. Irreversible or destructive actions must require confirmation. Routine business workflows should not require unnecessary previews or confirmations.

The interface should anticipate the user's next action and complete safe work automatically whenever possible.

## 7. Automation Philosophy

Automation should:

- save time
- reduce clicks
- reduce memory burden
- prevent missed follow-up
- preserve proof automatically

Automation should never surprise the user.

Safe automation is welcome when the user has already configured the rule, such as recurring invoices or unresolved decision reminders.

Risky actions should remain clear and reversible where possible. Sending emails, changing financial status, and deleting records must always preserve proof and respect existing business rules.

## 8. Future Design Rules

Before implementing any feature, ask:

- Which workspace does this belong to?
- What primary question does this screen answer?
- Does this increase or decrease cognitive load?
- Does this duplicate another screen, status, table, or workflow?
- Should this become automation instead?
- Can this become simpler?
- Which role owns this decision: manager, owner/admin, technician, or customer?
- What proof or history should be recorded automatically?

Prefer extending existing systems over introducing new ones.

One robust system is better than multiple overlapping systems.

Every new abstraction should remove complexity rather than create it.

## Suggested Future Additions

These topics should be added when the related workflows mature:

- Role-by-role workspace map
- Queue lifecycle model
- Estimate-to-invoice lifecycle model
- Proof and activity logging standards
- Automation safety levels
- Mobile-first workflow standards
- Demo mode and client presentation principles
