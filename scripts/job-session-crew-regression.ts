import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import {
  calculateDetailedLaborMinutes,
  calculateSimpleLaborMinutes,
  combineLocalDateTime,
  minutesBetween,
} from "../src/app/lib/jobSessionLabor.ts";

const root = process.cwd();

const startedAt = new Date("2026-07-18T08:00:00").toISOString();
const endedAt = new Date("2026-07-18T18:00:00").toISOString();
const elapsedMinutes = minutesBetween(startedAt, endedAt);

assert.equal(elapsedMinutes, 600, "Editing start/end should update elapsed duration.");
assert.equal(
  combineLocalDateTime("2026-07-18", "07:00")! >
    combineLocalDateTime("2026-07-18", "08:00")!,
  false,
  "Invalid time ranges must be rejected before saving."
);
assert.equal(
  calculateSimpleLaborMinutes(elapsedMinutes, 3),
  1800,
  "Simple mode should calculate 3 people for 10 hours as 30 labor hours."
);
assert.equal(
  calculateDetailedLaborMinutes("2026-07-18", "08:00", "18:00", [
    { label: "Robbie", temporary: false, startTime: "08:00", endTime: "18:00" },
    { label: "Helper 1", temporary: true, startTime: "09:00", endTime: "16:00" },
    { label: "Helper 2", temporary: true, startTime: "10:00", endTime: "14:00" },
  ]),
  1260,
  "Detailed helper times should calculate 21 person-hours."
);

const migration = readFileSync(
  resolve(root, "supabase/sql/2026-07-18-editable-job-sessions-crew.sql"),
  "utf8"
);
const panel = readFileSync(
  resolve(root, "src/app/components/JobSessionPanel.tsx"),
  "utf8"
);
const hub = readFileSync(
  resolve(root, "src/app/job-sessions/page.tsx"),
  "utf8"
);

assert(
  migration.includes("crew_count integer not null default 1") &&
    migration.includes("crew_confirmed boolean not null default false") &&
    migration.includes("labor_minutes integer"),
  "Migration must preserve existing sessions with safe one-worker defaults."
);
assert(
  migration.includes("trimax_has_business_role") &&
    migration.includes("array['owner', 'admin']") &&
    migration.includes("user_id = auth.uid()"),
  "RLS must allow owner/admin corrections while keeping worker-owned edits scoped."
);
assert(
  migration.includes("for delete") &&
    migration.includes("job_session_breakdowns"),
  "Breakdown rows must be replaceable when edited after saving."
);
assert(
  panel.includes("Edit Session") &&
    panel.includes("Save Correction") &&
    panel.includes("setEditingSession"),
  "Completed session history must expose an edit flow."
);
assert(
  panel.includes("I Worked Alone") &&
    panel.includes("Add Temporary Helper") &&
    panel.includes("temporary: true") &&
    panel.includes("detail.temporary") &&
    !panel.includes("supabase.auth.admin") &&
    !panel.includes("inviteUserByEmail"),
  "Temporary helpers must not create auth users or require invitations."
);
assert(
  panel.includes("End time must be after start time.") &&
    panel.includes("Confirm the long session before saving this correction.") &&
    panel.includes("disabled={isBusy}"),
  "Edit flow must reject impossible ranges, guard long sessions, and prevent duplicate submits."
);
assert(
  panel.includes('action: "job_session.corrected"') &&
    panel.includes("previous") &&
    panel.includes("next"),
  "Session corrections must be activity logged with safe before/after values."
);
assert(
  panel.includes('breakdownBasis: "elapsed_session_time"') &&
    hub.includes("Total Labor Hours") &&
    hub.includes("Elapsed Time"),
  "UI must distinguish elapsed time from person-hours and breakdown basis."
);

console.log("Job session crew regression checks passed.");
