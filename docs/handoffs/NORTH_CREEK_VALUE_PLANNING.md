# North Creek — internal planning for Diana

Planning only; no measured improvement, savings, rent readiness or staffing claim has been established.

| Potential benefit | Existing evidence to reuse | Information still needed for a credible measure |
| --- | --- | --- |
| Fewer forgotten or interrupted jobs | Request review history, Queue status and deadlines, Job Sessions; optional recorded delay/blocker fields where installed | Agreed definition of forgotten/interrupted, pause reasons, recovery dates and a comparison period. An ended session alone is not an interruption. |
| Faster turnovers and rent readiness | Apartment-turn move-out date, requested Needed-By date, recorded work completion and session dates | Actual vacancy, inspection acceptance and rent-ready dates; baseline and comparable scope. Invoice dates do not establish completion or rent readiness. |
| Fewer repeat maintenance complaints | Property/unit request history and descriptions, linked Queue items | Consistent complaint category, recurrence window and verified same-problem resolution; descriptions alone cannot establish repeats. |
| Staffing and workload visibility | Queue work, scheduled dates, recorded session user/time and job type | Reliable assignments, availability, scope/effort estimates and validated session coverage. No productivity ranking from incomplete records. |
| Continuity during absence or turnover | Structured turn requirements, photos, self-reported submitter audit, owner review notes, Queue links and recorded work | Handoff ownership, coverage and next-step discipline; a self-reported name is not a verified employee identity. |
| Management/corporate reporting | Counts of recorded requests/work by property, recorded deadlines, actual completion dates and review history | Agreed reporting definitions, missing-data coverage, authorized audience and comparison periods; separate operational reporting from private financial records. |

Current visibility belongs in the existing Work Queue, owner only. No presentation, property-manager permission expansion, technician-management system or new data collection is part of this change.

Future authorized acceptance submissions: label their purpose explicitly, retain the receipt and exact business/request/Queue IDs, then add those verified IDs and evidence reference to `src/app/lib/verifiedSyntheticRequests.ts`. Never hide a request merely because its customer-supplied name or description contains “test.” The filter is reversible and does not archive, delete, convert, mark read, or edit any record.
