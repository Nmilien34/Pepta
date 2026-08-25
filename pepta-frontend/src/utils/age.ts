// Age in whole years from a birthday. Pure and RN-free, so it unit-tests in
// plain Node.
//
// WHY NOT `thisYear - birthYear`, which is what the reveal used to do: that is
// right only for people whose birthday has already passed this year, and a
// year too old for everyone else. Tolerable when it only picked a risk band;
// not tolerable now that the number is SHOWN to the user beside the wheel they
// are turning, where being told you are 26 the day before your 26th is simply
// wrong.

import type { DateParts } from './dateParts';

export function ageInYears(birthday: DateParts, now: Date = new Date()): number | null {
  const { year, month, day } = birthday;
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  let age = now.getFullYear() - year;
  // Has the birthday happened yet this year? month is 0-11, matching getMonth.
  const nowMonth = now.getMonth();
  const nowDay = now.getDate();
  if (nowMonth < month || (nowMonth === month && nowDay < day)) age -= 1;

  // A future date of birth has no age. The wheel cannot produce one (its max
  // year is 13 years back) but the helper is called with stored values too.
  return age < 0 ? null : age;
}

/** "26 years old" / "1 year old" — never a bare number. */
export function ageLabel(birthday: DateParts, now: Date = new Date()): string | null {
  const age = ageInYears(birthday, now);
  if (age == null) return null;
  return `${age} ${age === 1 ? 'year' : 'years'} old`;
}
