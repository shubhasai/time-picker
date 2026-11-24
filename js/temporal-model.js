/**
 * Location-agnostic calendar date & wall-clock time model backed by Temporal.Plain*
 * with feature-detected dynamic temporal-polyfill loading and an exact ISO-8601 fallback.
 */
(function (global) {
  'use strict';

  const ns = (global.NeonCalibre = global.NeonCalibre || {});

  const MONTHS_SHORT = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
  ];

  const MONTHS_FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const WEEKDAYS_SHORT = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  const MIN_YEAR = 1900;
  const MAX_YEAR = 2100;

  let polyfillRequested = false;

  function ensureTemporalPolyfill() {
    if (typeof globalThis.Temporal !== 'undefined' || polyfillRequested) {
      return;
    }
    polyfillRequested = true;
    // Feature-detected dynamic import per modern Temporal guidance
    import('https://esm.sh/temporal-polyfill')
      .then((module) => {
        if (module && module.Temporal && typeof globalThis.Temporal === 'undefined') {
          globalThis.Temporal = module.Temporal;
        }
      })
      .catch(() => {
        // Offline or blocked CDN: deterministic Gregorian fallback handles all operations
      });
  }

  ensureTemporalPolyfill();

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  function fallbackDaysInMonth(year, month) {
    const table = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return table[month - 1];
  }

  function daysInMonth(year, month) {
    if (typeof globalThis.Temporal !== 'undefined') {
      return globalThis.Temporal.PlainYearMonth.from({
        year,
        month,
        calendar: 'iso8601'
      }).daysInMonth;
    }
    return fallbackDaysInMonth(year, month);
  }

  function clampYear(year) {
    return Math.min(MAX_YEAR, Math.max(MIN_YEAR, year));
  }

  function now() {
    if (typeof globalThis.Temporal !== 'undefined') {
      const pdt = globalThis.Temporal.Now.plainDateTimeISO();
      const year = clampYear(pdt.year);
      const maxDay = daysInMonth(year, pdt.month);
      return {
        year,
        month: pdt.month,
        day: Math.min(pdt.day, maxDay),
        hour: pdt.hour,
        minute: pdt.minute
      };
    }
    const d = new Date();
    const year = clampYear(d.getFullYear());
    const month = d.getMonth() + 1;
    const maxDay = fallbackDaysInMonth(year, month);
    return {
      year,
      month,
      day: Math.min(d.getDate(), maxDay),
      hour: d.getHours(),
      minute: d.getMinutes()
    };
  }

  function withDate(current, patch) {
    const nextYear = clampYear(patch.year !== undefined ? patch.year : current.year);
    const nextMonth = patch.month !== undefined ? patch.month : current.month;
    const desiredDay = patch.day !== undefined ? patch.day : current.day;

    if (typeof globalThis.Temporal !== 'undefined') {
      const base = globalThis.Temporal.PlainDate.from({
        year: current.year,
        month: current.month,
        day: current.day,
        calendar: 'iso8601'
      });
      const updated = base.with(
        { year: nextYear, month: nextMonth, day: desiredDay },
        { overflow: 'constrain' }
      );
      return {
        year: updated.year,
        month: updated.month,
        day: updated.day,
        clampedDayDelta: updated.day - desiredDay
      };
    }

    const maxDay = fallbackDaysInMonth(nextYear, nextMonth);
    const clampedDay = Math.max(1, Math.min(maxDay, desiredDay));
    return {
      year: nextYear,
      month: nextMonth,
      day: clampedDay,
      clampedDayDelta: clampedDay - desiredDay
    };
  }

  function weekdayShort(year, month, day) {
    if (typeof globalThis.Temporal !== 'undefined') {
      const pd = globalThis.Temporal.PlainDate.from({
        year,
        month,
        day,
        calendar: 'iso8601'
      });
      return WEEKDAYS_SHORT[pd.dayOfWeek - 1];
    }
    // Sakamoto's weekday algorithm (location-agnostic Gregorian, 1=Mon..7=Sun)
    const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    const y = month < 3 ? year - 1 : year;
    const dowSun0 = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1] + day) % 7;
    const isoDow = dowSun0 === 0 ? 7 : dowSun0;
    return WEEKDAYS_SHORT[isoDow - 1];
  }

  function toISOString(state) {
    if (typeof globalThis.Temporal !== 'undefined') {
      const pd = globalThis.Temporal.PlainDate.from({
        year: state.year,
        month: state.month,
        day: state.day,
        calendar: 'iso8601'
      });
      const pt = globalThis.Temporal.PlainTime.from({
        hour: state.hour,
        minute: state.minute
      });
      return pd.toPlainDateTime(pt).toString({ smallestUnit: 'minute' });
    }
    return `${state.year}-${pad2(state.month)}-${pad2(state.day)}T${pad2(state.hour)}:${pad2(state.minute)}`;
  }

  function hour24To12(hour24) {
    const isPM = hour24 >= 12;
    const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return { hour12: h12, isPM };
  }

  function hour12To24(hour12Mod12, isPM) {
    const normalized = ((hour12Mod12 % 12) + 12) % 12;
    return isPM ? normalized + 12 : normalized;
  }

  function formatDisplayDate(year, month, day) {
    const wk = weekdayShort(year, month, day);
    return `${wk} · ${pad2(day)} ${MONTHS_SHORT[month - 1]} ${year}`;
  }

  function formatDisplayTime(hour24, minute, is24h) {
    if (is24h) {
      return `${pad2(hour24)}:${pad2(minute)}`;
    }
    const { hour12, isPM } = hour24To12(hour24);
    return `${pad2(hour12)}:${pad2(minute)} ${isPM ? 'PM' : 'AM'}`;
  }

  ns.TemporalModel = {
    MIN_YEAR,
    MAX_YEAR,
    MONTHS_SHORT,
    MONTHS_FULL,
    pad2,
    isLeapYear,
    daysInMonth,
    now,
    withDate,
    weekdayShort,
    toISOString,
    hour24To12,
    hour12To24,
    formatDisplayDate,
    formatDisplayTime
  };
})(window);
