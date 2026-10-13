/** Dates and times as shown across the app, e.g. "Oct 2, 2026, 10:00 AM" in the browser's locale. */
export const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
