import { dateKey } from "./model.ts";

const fixed = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));

function weekday(year: number, month: number, day: number, occurrence: number) {
  const first = fixed(year, month, 1);
  return fixed(year, month, 1 + (day - first.getUTCDay() + 7) % 7 + 7 * (occurrence - 1));
}

function memorialDay(year: number) {
  const last = fixed(year, 5, 31);
  last.setUTCDate(31 - (last.getUTCDay() + 6) % 7);
  return last;
}

function holidays(year: number) {
  return [
    ["New Year’s Day", fixed(year, 1, 1), true],
    ["Birthday of Martin Luther King, Jr.", weekday(year, 1, 1, 3), false],
    ["Washington’s Birthday", weekday(year, 2, 1, 3), false],
    ["Memorial Day", memorialDay(year), true],
    ["Juneteenth National Independence Day", fixed(year, 6, 19), false],
    ["Independence Day", fixed(year, 7, 4), true],
    ["Labor Day", weekday(year, 9, 1, 1), true],
    ["Columbus Day", weekday(year, 10, 1, 2), false],
    ["Veterans Day", fixed(year, 11, 11), false],
    ["Thanksgiving Day", weekday(year, 11, 4, 4), true],
    ["Christmas Day", fixed(year, 12, 25), true],
  ] as const;
}

export type FederalHoliday = { name: string; major: boolean; observed: boolean };

// OPM's standard Monday–Friday observance. Include adjacent holiday years
// because a Saturday New Year's Day is observed in the prior December.
export function federalHolidaysByDate(year: number) {
  const dates: Record<string, FederalHoliday> = {};
  for (const holidayYear of [year, year + 1]) {
    for (const [name, actual, major] of holidays(holidayYear)) {
      const observed = new Date(actual);
      const weekday = actual.getUTCDay();
      observed.setUTCDate(actual.getUTCDate() + (weekday === 6 ? -1 : weekday === 0 ? 1 : 0));
      for (const date of [actual, observed]) {
        if (date.getUTCFullYear() !== year) continue;
        dates[dateKey(date)] = { name, major, observed: +date !== +actual };
      }
    }
  }
  return dates;
}

export function federalHolidayLabel(holiday: FederalHoliday) {
  return holiday.name + (holiday.observed ? " (observed)" : "");
}
