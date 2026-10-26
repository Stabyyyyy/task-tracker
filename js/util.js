/* =========================================================================
   util.js — dates, ids, formatting, small DOM helpers.
   No dependencies. Everything hangs off the global TT namespace, because the
   app uses classic <script> tags (no ES modules) so it also works from
   file:// as well as GitHub Pages.
   ========================================================================= */
(function (global) {
  'use strict';

  const TT = (global.TT = global.TT || {});
  const MS_DAY = 86400000;

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /* ---------------------------------------------------------------- dates */

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /** Local calendar date -> 'YYYY-MM-DD'. Never uses toISOString (UTC drift). */
  function dateKey(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  /** 'YYYY-MM-DD' -> Date at local midnight. */
  function parseKey(key) {
    const p = String(key).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function nowISO() {
    return new Date().toISOString();
  }

  /** True only for real calendar dates — rejects 2026-02-31 and 2026-13-01. */
  function isDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = parseKey(value);
    return d.getFullYear() === Number(value.slice(0, 4)) &&
      d.getMonth() === Number(value.slice(5, 7)) - 1 &&
      d.getDate() === Number(value.slice(8, 10));
  }

  function addDays(key, n) {
    const d = parseKey(key);
    d.setDate(d.getDate() + n);
    return dateKey(d);
  }

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  /**
   * Add months while keeping a day-of-month anchor. This is what stops the
   * classic "Jan 31 -> Feb 28 -> Mar 28" drift: the target day is always
   * derived from the anchor, never from the previously clamped date.
   */
  function addMonthsClamped(key, n, anchorDay) {
    const d = parseKey(key);
    const total = d.getFullYear() * 12 + d.getMonth() + n;
    const year = Math.floor(total / 12);
    const month = total % 12;
    const day = Math.min(anchorDay || d.getDate(), daysInMonth(year, month));
    return dateKey(new Date(year, month, day));
  }

  /** Whole days from b to a (positive when a is later). DST-safe via rounding. */
  function diffDays(a, b) {
    return Math.round((parseKey(a) - parseKey(b)) / MS_DAY);
  }

  /** Monday-based start of week for a given date key. */
  function startOfWeek(key, weekStart) {
    const d = parseKey(key);
    const start = typeof weekStart === 'number' ? weekStart : 1;
    const shift = (d.getDay() - start + 7) % 7;
    d.setDate(d.getDate() - shift);
    return dateKey(d);
  }

  /** ISO-8601 week key, e.g. '2026-W44'. Computed in UTC so DST can't shift it. */
  function isoWeekKey(key) {
    const d = parseKey(key);
    const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((target - yearStart) / MS_DAY + 1) / 7);
    return target.getUTCFullYear() + '-W' + pad2(week);
  }

  /** '2026-W44' -> the Monday of that week, as a date key. */
  function weekKeyToMonday(weekKey) {
    const year = Number(weekKey.slice(0, 4));
    const week = Number(weekKey.slice(6, 8));
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const monday = new Date(year, 0, 4 - jan4Day + 1 + (week - 1) * 7);
    return dateKey(monday);
  }

  function monthKey(key) {
    return String(key).slice(0, 7);
  }

  function nextMonthKey(mk) {
    const y = Number(mk.slice(0, 4));
    const m = Number(mk.slice(5, 7));
    return m === 12 ? (y + 1) + '-01' : y + '-' + pad2(m + 1);
  }

  function prevMonthKey(mk) {
    const y = Number(mk.slice(0, 4));
    const m = Number(mk.slice(5, 7));
    return m === 1 ? (y - 1) + '-12' : y + '-' + pad2(m - 1);
  }

  function lastDayOfMonthKey(mk) {
    const y = Number(mk.slice(0, 4));
    const m = Number(mk.slice(5, 7));
    return mk + '-' + pad2(daysInMonth(y, m - 1));
  }

  /**
   * Period keys strictly between two keys (exclusive on both ends).
   * Used to backfill skipped periods with an explicit 0 so stats can tell
   * "recorded zero" apart from "app was never opened".
   */
  function periodsBetween(unit, fromExclusive, toExclusive, cap) {
    const limit = cap || 400;
    const out = [];
    if (unit === 'week') {
      let cur = isoWeekKey(addDays(weekKeyToMonday(fromExclusive), 7));
      while (cur < toExclusive && out.length < limit) {
        out.push(cur);
        cur = isoWeekKey(addDays(weekKeyToMonday(cur), 7));
      }
      return out;
    }
    if (unit === 'month') {
      let cur = nextMonthKey(fromExclusive);
      while (cur < toExclusive && out.length < limit) {
        out.push(cur);
        cur = nextMonthKey(cur);
      }
      return out;
    }
    let cur = addDays(fromExclusive, 1);
    while (cur < toExclusive && out.length < limit) {
      out.push(cur);
      cur = addDays(cur, 1);
    }
    return out;
  }

  /** Inclusive list of period keys covering a date range. */
  function periodKeysInRange(unit, fromKey, toKey) {
    const out = [];
    if (unit === 'week') {
      let monday = weekKeyToMonday(isoWeekKey(fromKey));
      let guard = 0;
      while (monday <= toKey && guard++ < 300) {
        out.push(isoWeekKey(monday));
        monday = addDays(monday, 7);
      }
      return out;
    }
    if (unit === 'month') {
      let cur = monthKey(fromKey);
      const end = monthKey(toKey);
      let guard = 0;
      while (cur <= end && guard++ < 300) {
        out.push(cur);
        cur = nextMonthKey(cur);
      }
      return out;
    }
    let cur = fromKey;
    let guard = 0;
    while (cur <= toKey && guard++ < 900) {
      out.push(cur);
      cur = addDays(cur, 1);
    }
    return out;
  }

  /* ------------------------------------------------------------ formatting */

  function formatDate(key, style) {
    if (!key) return '';
    const d = parseKey(key);
    const day = d.getDate();
    const mon = MONTHS_SHORT[d.getMonth()];
    if (style === 'long') {
      return DAYS[d.getDay()] + ', ' + day + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    }
    if (style === 'medium') {
      return DAYS_SHORT[d.getDay()] + ' ' + day + ' ' + mon;
    }
    return day + ' ' + mon;
  }

  function formatDateWithYear(key) {
    if (!key) return '';
    return formatDate(key, 'short') + ' ' + String(key).slice(0, 4);
  }

  /** Short human label for a due date relative to today. */
  function humanDue(key, today) {
    if (!key) return '';
    const ref = today || todayKey();
    const delta = diffDays(key, ref);
    if (delta === 0) return 'Today';
    if (delta === 1) return 'Tomorrow';
    if (delta === -1) return 'Yesterday';
    if (delta < -1) return Math.abs(delta) + ' days ago';
    if (delta < 7) return 'In ' + delta + ' days';
    return formatDate(key, 'medium');
  }

  function humanRecurrence(rule) {
    if (!rule) return '';
    const n = Math.max(1, Number(rule.every) || 1);
    const unit = rule.unit === 'day' ? 'day' : rule.unit === 'month' ? 'month' : 'week';
    const text = n === 1
      ? 'Every ' + unit
      : 'Every ' + n + ' ' + unit + 's';
    if (rule.endType === 'until' && rule.until) {
      return text + ' until ' + formatDateWithYear(rule.until);
    }
    return text;
  }

  function plural(n, word) {
    return n === 1 ? word : word + 's';
  }

  function timeToMinutes(value) {
    if (typeof value !== 'string' || !/^\d{1,2}:\d{2}$/.test(value)) return 9 * 60;
    const p = value.split(':');
    return Math.min(23, Number(p[0])) * 60 + Math.min(59, Number(p[1]));
  }

  function minutesNow(date) {
    const d = date || new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function formatTime12(value) {
    const mins = timeToMinutes(value);
    const h24 = Math.floor(mins / 60);
    const m = mins % 60;
    const suffix = h24 >= 12 ? 'pm' : 'am';
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    return h + (m ? ':' + pad2(m) : '') + suffix;
  }

  /* ------------------------------------------------------------------- ids */

  function uid(prefix) {
    let rand;
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      rand = global.crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    } else {
      rand = Math.random().toString(36).slice(2, 12);
    }
    return (prefix || 'id') + '_' + Date.now().toString(36) + rand;
  }

  /* --------------------------------------------------------------- strings */

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments;
      const self = this;
      global.clearTimeout(timer);
      timer = global.setTimeout(() => fn.apply(self, args), wait);
    };
  }

  /* ------------------------------------------------------------------ misc */

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    global.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Could not read file'));
      reader.readAsText(file);
    });
  }

  function bytesToSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  TT.U = {
    MS_DAY,
    MONTHS,
    MONTHS_SHORT,
    DAYS,
    DAYS_SHORT,
    pad2,
    dateKey,
    parseKey,
    todayKey,
    nowISO,
    isDateKey,
    addDays,
    daysInMonth,
    addMonthsClamped,
    diffDays,
    startOfWeek,
    isoWeekKey,
    weekKeyToMonday,
    monthKey,
    nextMonthKey,
    prevMonthKey,
    lastDayOfMonthKey,
    periodsBetween,
    periodKeysInRange,
    formatDate,
    formatDateWithYear,
    humanDue,
    humanRecurrence,
    plural,
    timeToMinutes,
    minutesNow,
    formatTime12,
    uid,
    escapeHtml,
    escapeAttr,
    clamp,
    debounce,
    downloadText,
    readFileText,
    bytesToSize
  };
})(typeof window !== 'undefined' ? window : globalThis);
