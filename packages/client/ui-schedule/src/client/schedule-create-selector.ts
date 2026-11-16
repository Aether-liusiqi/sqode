/**
 * Timing selector helpers shared by the automation-task creation form.
 *
 * These are pure so the generated cron expression can be unit-tested without
 * rendering the form or a DOM.
 */

/**
 * Build the standard five-field cron expression for a rule that fires at
 * several hours of the same minute every day, optionally limited to weekdays.
 *
 * The minute is shared on purpose: cron expands minute and hour fields as a
 * cartesian product, so a single expression can only express several wall-clock
 * times when they all sit on the same minute. Hours and weekdays are sorted so
 * the result is stable regardless of the order the user picked them in.
 * @param hours - hours of the day (0 through 23) to fire at.
 * @param minute - shared minute (0 through 59) every fire lands on.
 * @param weekdays - ISO-style weekdays (1 Monday through 7 Sunday); empty means every day.
 * @returns a cron expression such as `30 8,13,18 * * *`.
 */
export function buildMultiTimeCron(
  hours: readonly number[],
  minute: number,
  weekdays: readonly number[],
): string {
  const hourPart = [...hours].sort((left, right) => left - right).join(',')
  const dayPart = weekdays.length === 0
    ? '*'
    : [...weekdays].map(weekday => String(weekday % 7)).sort().join(',')
  return `${minute} ${hourPart} * * ${dayPart}`
}
