/* =========================================================================
   daily.js — the optional daily ledger behind the review page's trend chart.

   state.daily[YYYY-MM-DD] = {
     completed: <non-counter completions whose completedAt falls on this day>,
     counters:  { <taskId>: <that counter's final main count for the day> }
   }

   Records are written at mutation time only. Nothing is backfilled from old
   tasks, so importing a v1/v2 backup does not invent history that was never
   recorded. Missing days simply have no entry.
   ========================================================================= */
(function (global) {
  'use strict';

  const TT = global.TT;
  const U = TT.U;

  const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
  const MAX_DAYS = 2000;

  function validKey(key) {
    return typeof key === 'string' && DAY_KEY.test(key) && U.isDateKey(key);
  }

  function keyOf(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return U.dateKey(d);
  }

  function ensure(state, key) {
    if (!validKey(key)) return null;
    if (!state.daily || typeof state.daily !== 'object') state.daily = {};
    if (!state.daily[key] || typeof state.daily[key] !== 'object') {
      state.daily[key] = { completed: 0, counters: {} };
    }
    const rec = state.daily[key];
    if (!Number.isFinite(rec.completed) || rec.completed < 0) rec.completed = 0;
    if (!rec.counters || typeof rec.counters !== 'object') rec.counters = {};
    return rec;
  }

  /** +1 on completion, -1 on un-completion / deletion of a done task. */
  function bumpCompleted(state, iso, delta) {
    const key = keyOf(iso);
    if (!key || !delta) return;
    const rec = ensure(state, key);
    if (rec) rec.completed = Math.max(0, Math.round(rec.completed + delta));
  }

  /** Last write wins, so the day's record ends up as that day's final value. */
  function setCounter(state, key, taskId, value) {
    if (!taskId || !validKey(key)) return;
    const rec = ensure(state, key);
    if (!rec) return;
    const n = Number(value);
    rec.counters[taskId] = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }

  /**
   * Finalise a day that just closed without overwriting a value the user
   * already recorded. A daily counter that was incremented has its final
   * count in `history[day]` AND in this ledger; a counter whose value came
   * from an imported backup only has `history[day]`. Filling the gap keeps
   * the trend chart honest without inventing a value for a day that never
   * had one.
   */
  function setCounterIfMissing(state, key, taskId, value) {
    if (!taskId || !validKey(key)) return;
    const rec = state.daily && state.daily[key];
    if (rec && rec.counters && Object.prototype.hasOwnProperty.call(rec.counters, taskId)) return;
    setCounter(state, key, taskId, value);
  }

  /** Sanitise an imported / migrated daily map without ever failing a load. */
  function normalizeDaily(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).slice(0, MAX_DAYS).forEach((key) => {
      if (!validKey(key)) return;
      const rec = raw[key];
      if (!rec || typeof rec !== 'object') return;
      const n = Number(rec.completed);
      const counters = {};
      if (rec.counters && typeof rec.counters === 'object') {
        Object.keys(rec.counters).forEach((id) => {
          const v = Number(rec.counters[id]);
          if (Number.isFinite(v) && v >= 0) counters[id] = Math.max(0, Math.round(v));
        });
      }
      out[key] = {
        completed: Number.isFinite(n) && n >= 0 ? Math.round(n) : 0,
        counters
      };
    });
    return out;
  }

  TT.Daily = {
    validKey,
    keyOf,
    ensure,
    bumpCompleted,
    setCounter,
    setCounterIfMissing,
    normalizeDaily
  };
})(typeof window !== 'undefined' ? window : globalThis);
