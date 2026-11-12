import assert from "node:assert/strict";
import { federalHolidayLabel, federalHolidaysByDate } from "../src/app/calendar/federalHolidays.ts";
import { isVerifiedSyntheticRequest, syntheticBusinessId } from "../src/app/lib/verifiedSyntheticRequests.ts";

const dates = federalHolidaysByDate(2026);
assert.deepEqual(Object.keys(dates).filter(day => !dates[day].observed), [
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19",
  "2026-07-04", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
]);
assert.equal(Object.values(dates).filter(holiday => holiday.major && !holiday.observed).length, 6);
assert.equal(federalHolidayLabel(dates["2026-07-03"]), "Independence Day (observed)");
assert.equal(federalHolidayLabel(federalHolidaysByDate(2027)["2027-12-31"]), "New Year’s Day (observed)");
assert.equal(federalHolidayLabel(federalHolidaysByDate(2028)["2028-01-01"]), "New Year’s Day");
assert.equal(federalHolidayLabel(federalHolidaysByDate(2027)["2027-07-05"]), "Independence Day (observed)");
for (const id of ["9655234a-9876-4f66-b6aa-848cb7bc30d4", "2cdb9bcb-a429-43fb-9eb5-07b212a4f6b6"]) {
  assert.equal(isVerifiedSyntheticRequest(syntheticBusinessId, id), true);
  assert.equal(isVerifiedSyntheticRequest("other-workspace", id), false);
}
assert.equal(isVerifiedSyntheticRequest(syntheticBusinessId, "unrelated-request"), false);
console.log("Federal holiday and retained request checks passed");
