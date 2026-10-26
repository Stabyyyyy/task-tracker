/* =========================================================================
   counters.js — the three counter types and their period handling.

   Type A  daily       resets each local day, history keeps each day's total
   Type B  cumulative  never resets; history stores per-day deltas and the
                       running total is DERIVED (one source of truth)
   Type C  periodic    resets weekly or monthly, has a target
   ========================================================================= */
(function (global) {
  'use strict';

  const TT = global.TT;
  const U = TT.U;

  const LOG_LIMIT = 300;

  function newCounter(input) {
    const c = input || {};
    const type = ['daily', 'cumulative', 'periodic'].indexOf(c.type) >= 0 ? c.type : 'daily';
    const period = type === 'periodic' ? (c.period === 'month' ? 'month' : 'week') : null;

    let target = null;
    if (c.target !== null && c.target !== undefined && c.target !== '') {
      const n = Number(c.target);
      if (Number.isFinite(n)) target = Math.max(0, n);
    }

    return {
      type,
      period,
      target,
      value: 0,
      periodKey: null,
      history: {},
      // Snapshot per closed period: { start, end, value, target, outcome,
      // inferred }. `history` stays the numeric ledger; this map only adds the
      // target that was in force when the period closed, plus its outcome.
      periods: {},
      log: []
    };
  }

  /** The period unit this counter accumulates in. */
  function periodUnit(counter) {
    if (counter.type === 'periodic') return counter.period === 'month' ? 'month' : 'week';
    return 'day';
  }

  /** First and last calendar day covered by a period key. */
  function periodBounds(counter, key) {
    if (!key) return { start: null, end: null };
    if (counter.type === 'periodic' && counter.period === 'month') {
      return { start: key + '-01', end: U.lastDayOfMonthKey(key) };
    }
    if (counter.type === 'periodic') {
      const monday = U.weekKeyToMonday(key);
      return { start: monday, end: U.addDays(monday, 6) };
    }
    return { start: key, end: key };
  }

  /** How a finished period compares to the target it was measured against. */
  function outcomeOf(value, target) {
    if (value === null || value === undefined) return 'unknown';
    if (target === null || target === undefined) return 'none';
    if (value > target) return 'exceeded';
    if (value >= target) return 'met';
    return 'missed';
  }

  function periodKeyFor(counter, now) {
    const key = U.dateKey(now || new Date());
    if (counter.type === 'periodic') {
      return counter.period === 'month' ? U.monthKey(key) : U.isoWeekKey(key);
    }
    return key;
  }

  /**
   * Snapshot a closed period. Deliberately independent of the `history` write
   * above: a daily counter already has yesterday's key in `history` (written by
   * the last +1 of that day), so sharing that guard would mean records almost
   * never got created. Never overwrites — a closed period is immutable.
   */
  function writeRecord(counter, key) {
    if (counter.type === 'cumulative') return null;
    if (!counter.periods) counter.periods = {};
    if (key in counter.periods) return counter.periods[key];

    const bounds = periodBounds(counter, key);
    const raw = Number(counter.history[key]);
    const value = Number.isFinite(raw) ? raw : 0;
    const target = counter.target === undefined ? null : counter.target;

    counter.periods[key] = {
      start: bounds.start,
      end: bounds.end,
      value,
      target,
      outcome: outcomeOf(value, target),
      inferred: false
    };
    return counter.periods[key];
  }

  /**
   * Move a counter onto the current period. Only ever moves forward and never
   * overwrites an existing history entry — a clock change or a timezone jump
   * can otherwise erase today's number.
   */
  function reconcile(counter, now) {
    if (!counter) return false;
    const current = periodKeyFor(counter, now);
    if (!counter.periodKey) {
      counter.periodKey = current;
      return true;
    }
    if (current <= counter.periodKey) return false;

    const unit = periodUnit(counter);
    const closing = counter.periodKey;

    if (counter.type !== 'cumulative') {
      if (!(closing in counter.history)) {
        counter.history[closing] = counter.value || 0;
      }
      writeRecord(counter, closing);
    }

    // Backfill untouched periods with an explicit 0 so stats can distinguish
    // "recorded zero" from "app was not opened".
    U.periodsBetween(unit, closing, current, 400).forEach((key) => {
      if (!(key in counter.history)) counter.history[key] = 0;
      writeRecord(counter, key);
    });

    counter.periodKey = current;
    counter.value = 0;
    return true;
  }

  function reconcileAll(now) {
    const date = now || new Date();
    let changed = false;
    TT.Store.get().tasks.forEach((t) => {
      if (t.kind === 'counter' && t.counter && reconcile(t.counter, date)) changed = true;
    });
    // Only commit when something actually rolled over, so the 30s scheduler
    // tick doesn't force a re-render on every pass.
    if (changed) TT.Store.commit(() => {});
    return changed;
  }

  /** Non-mutating read: a counter whose period has rolled over reads as 0. */
  function effectiveValue(counter, now) {
    if (!counter) return 0;
    if (counter.type === 'cumulative') return total(counter);
    const key = periodKeyFor(counter, now);
    if (counter.periodKey && counter.periodKey !== key) return 0;
    return counter.value || 0;
  }

  function total(counter) {
    let sum = 0;
    if (!counter || !counter.history) return 0;
    Object.keys(counter.history).forEach((k) => {
      const v = Number(counter.history[k]);
      if (Number.isFinite(v)) sum += v;
    });
    return Math.max(0, sum);
  }

  function unitLabel(counter) {
    if (counter.type === 'daily') return 'today';
    if (counter.type === 'cumulative') return 'all time';
    return counter.period === 'month' ? 'this month' : 'this week';
  }

  function periodLabel(counter, key) {
    const k = key || counter.periodKey;
    if (counter.type === 'cumulative') return 'All time';
    if (counter.type === 'daily') {
      if (!k) return 'Today';
      return k === U.todayKey() ? 'Today' : U.formatDate(k, 'medium');
    }
    if (!k) return counter.period === 'month' ? 'This month' : 'This week';
    if (counter.period === 'month') {
      const month = Number(k.slice(5, 7)) - 1;
      return U.MONTHS[month] + ' ' + k.slice(0, 4);
    }
    const monday = U.weekKeyToMonday(k);
    const sunday = U.addDays(monday, 6);
    return U.formatDate(monday, 'short') + ' – ' + U.formatDate(sunday, 'short');
  }

  function progress(task, now) {
    const counter = task.counter;
    const value = effectiveValue(counter, now);
    const target = counter && counter.target != null ? counter.target : null;
    const met = target != null && value >= target;
    const pct = target ? U.clamp(Math.round((value / target) * 100), 0, 100) : null;

    return {
      value,
      target,
      met,
      exceeded: met && value > target,
      pct,
      remaining: target != null ? Math.max(0, target - value) : null,
      unitLabel: unitLabel(counter),
      periodLabel: periodLabel(counter)
    };
  }

  function pushLog(counter, delta, key, now) {
    counter.log.push({ at: now.toISOString(), delta, key });
    if (counter.log.length > LOG_LIMIT) {
      counter.log.splice(0, counter.log.length - LOG_LIMIT);
    }
  }

  /**
   * Apply +1 / -1. Reconciles first so a click at 00:00:30 lands in the new
   * period rather than the old one.
   */
  function increment(taskId, delta, now) {
    const date = now || new Date();
    let applied = 0;
    let becameMet = false;

    TT.Store.commit((s) => {
      const t = s.tasks.find((x) => x.id === taskId);
      if (!t || !t.counter) return;
      const c = t.counter;
      reconcile(c, date);
      const key = c.periodKey;

      if (c.type === 'cumulative') {
        const current = total(c);
        const effective = Math.max(-current, delta);
        if (effective === 0) return;
        c.history[key] = (c.history[key] || 0) + effective;
        pushLog(c, effective, key, date);
        applied = effective;
      } else {
        const next = Math.max(0, (c.value || 0) + delta);
        if (next === c.value) return;
        applied = next - c.value;
        c.value = next;
        c.history[key] = next;
        pushLog(c, applied, key, date);
      }

      t.updatedAt = U.nowISO();

      if (c.target != null && effectiveValue(c, date) >= c.target) becameMet = true;
    });

    if (applied && becameMet && TT.Reminders) {
      TT.Reminders.markSatisfied(taskId);
    }
    return applied;
  }

  function setTarget(taskId, target) {
    let value = null;
    if (target !== null && target !== undefined && target !== '') {
      const n = Number(target);
      if (Number.isFinite(n)) value = Math.max(0, n);
    }
    TT.Store.commit((s) => {
      const t = s.tasks.find((x) => x.id === taskId);
      if (!t || !t.counter) return;
      t.counter.target = value;
      t.updatedAt = U.nowISO();
    });
  }

  TT.Counters = {
    newCounter,
    periodUnit,
    periodKeyFor,
    periodBounds,
    outcomeOf,
    writeRecord,
    reconcile,
    reconcileAll,
    effectiveValue,
    total,
    unitLabel,
    periodLabel,
    progress,
    increment,
    setTarget
  };
})(typeof window !== 'undefined' ? window : globalThis);
