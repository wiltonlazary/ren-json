// An input's valueAsNumber and valueAsDate as the value they write: the HTML
// standard's conversions, as ren-html's document converts them (a mirror of
// its code, which ren-json does not depend on), with a browser's range: a
// date, week or month outside 0001-01-01..275760-09-13 writes no value.

/** The input types valueAsNumber applies to. */
const NUMBERED = new Set(['number', 'range', 'date', 'month', 'week', 'time', 'datetime-local']);
/** The input types valueAsDate applies to (not datetime-local, which has no Date of its own). */
const DATED = new Set(['date', 'month', 'week', 'time']);

const pad = (/** @type {number} */ n, /** @type {number} */ width = 2) => String(n).padStart(width, '0');
/** A time of day, as a browser writes one: HH:MM, then :SS and .sss when not zero. @param {Date} d */
const clock = d => {
  const s = d.getUTCSeconds();
  const ms = d.getUTCMilliseconds();
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${s || ms ? `:${pad(s)}` : ''}${ms ? `.${pad(ms, 3)}` : ''}`;
};
const day = (/** @type {Date} */ d) => `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** A UTC midnight's time, with the year as given (Date.UTC reads 0..99 as 1900..1999). @param {number} y @param {number} m @param {number} d */
const utc = (y, m, d) => new Date(0).setUTCFullYear(y, m, d);
/** The ISO week a UTC date falls in: [year, week]. @param {Date} d */
const isoWeek = d => {
  const t = new Date(utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const first = utc(t.getUTCFullYear(), 0, 1);
  return [t.getUTCFullYear(), Math.ceil(((t.getTime() - first) / 86400000 + 1) / 7)];
};
/** The first and last days a date, week or datetime-local input holds, as times: 0001-01-01 and 275760-09-13, JavaScript's last. */
const DAYS = [utc(1, 0, 1), 8.64e15];
/** The first and last months a month input holds, counted from 1970-01: 0001-01 and 275760-09. */
const MONTHS = [(1 - 1970) * 12, (275760 - 1970) * 12 + 8];

/** A number as an input of `type` writes it, by the standard's conversions ('' for none). @param {string} type @param {number} n */
function numberText(type, n) {
  if (type === 'number' || type === 'range') return String(n);
  if (type === 'month') {
    const m = Math.floor(n);
    if (m < MONTHS[0] || m > MONTHS[1]) return '';
    return `${pad(1970 + Math.floor(m / 12), 4)}-${pad((((m % 12) + 12) % 12) + 1)}`;
  }
  // A time of day is any number's; a date outside 0001-01-01..275760-09-13 has no value.
  if (type !== 'time' && (n < DAYS[0] || n > DAYS[1])) return '';
  const d = new Date(n);
  if (type === 'date') return day(d);
  if (type === 'time') return clock(new Date(((n % 86400000) + 86400000) % 86400000));
  if (type === 'week') {
    const [year, week] = isoWeek(d);
    return `${pad(year, 4)}-W${pad(week)}`;
  }
  return `${day(d)}T${clock(d)}`;
}

/**
 * The value an input of `type` (lowercased) holds after valueAsNumber is set
 * to `value` ('' for none). Throws as a browser does: TypeError on an
 * infinite number, InvalidStateError where it does not apply.
 * @param {string} type @param {unknown} value
 */
export function numberValue(type, value) {
  const n = Number(value);
  if (n === Infinity || n === -Infinity) throw new TypeError(`The provided double value is non-finite: ${String(value)}`);
  if (!NUMBERED.has(type)) throw new DOMException('This input element does not support Number values.', 'InvalidStateError');
  return Number.isNaN(n) ? '' : numberText(type, n);
}

/**
 * The value an input of `type` (lowercased) holds after valueAsDate is set to
 * `value` ('' for none: null or an invalid Date). Throws as a browser does:
 * TypeError on a value that is not a Date, InvalidStateError where it does
 * not apply.
 * @param {string} type @param {unknown} value
 */
export function dateValue(type, value) {
  if (value !== null && typeof value !== 'object' && typeof value !== 'function') throw new TypeError("Failed to set 'valueAsDate': the provided value is not of type 'object'");
  if (!DATED.has(type)) throw new DOMException('This input element does not support Date values.', 'InvalidStateError');
  if (value !== null && !(value instanceof Date)) throw new TypeError("Failed to set 'valueAsDate': the provided value is not a Date");
  if (value === null || Number.isNaN(value.getTime())) return '';
  return type === 'month' ? numberText('month', (value.getUTCFullYear() - 1970) * 12 + value.getUTCMonth()) : numberText(type, value.getTime());
}
