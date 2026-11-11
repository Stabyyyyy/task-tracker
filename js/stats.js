/* =========================================================================
   stats.js — period ranges and the aggregation used by the review page.
   Everything here is derived on the fly; nothing is cached in storage.
   ========================================================================= */
(function (global) {
  'use strict';

  const TT = global.TT;
  const U = TT.U;

  const GRANULARITIES = ['week', 'month', 'year'];

  function range(granularity, anchorKey) {
    const g = GRANULARITIES.indexOf(granularity) >= 0 ? granularity : 'week';
    const anchor = anchorKey || U.todayKey();
    let from;
    let to;

    if (g === 'week') {
      from = U.startOfWeek(anchor, 1);
      to = U.addDays(from, 6);
    } else if (g === 'month') {
      const mk = U.monthKey(anchor);
      from = mk + '-01';
      to = U.lastDayOfMonthKey(mk);
    } else {
      from = anchor.slice(0, 4) + '-01-01';
      to = anchor.slice(0, 4) + '-12-31';
    }

    return {
      granularity: g,
      anchor,
      from,
      to,
      unit: g === 'week' ? 'day' : g === 'month' ? 'day' : 'month',
      label: label(g, from, to),
      isCurrent: anchor >= from && anchor <= to
    };
  }

  function label(g, from, to) {
    if (g === 'year') return from.slice(0, 4);
    if (g === 'month') {
      return U.MONTHS[Number(from.slice(5, 7)) - 1] + ' ' + from.slice(0, 4);
    }
    const f = U.parseKey(from);
    const t = U.parseKey(to);
    if (f.getMonth() === t.getMonth()) {
      return f.getDate() + ' – ' + t.getDate() + ' ' + U.MONTHS_SHORT[f.getMonth()] + ' ' + f.getFullYear();
    }
    return U.formatDate(from, 'short') + ' – ' + U.formatDate(to, 'short') + ' ' + t.getFullYear();
  }

  function shift(granularity, anchorKey, dir) {
    if (granularity === 'month') {
      const mk = U.monthKey(anchorKey);
      return U.addMonthsClamped(mk + '-01', dir, 1);
    }
    if (granularity === 'year') {
      return (Number(anchorKey.slice(0, 4)) + dir) + '-01-01';
    }
    return U.addDays(anchorKey, 7 * dir);
  }

  function inRange(key, r) {
    return key >= r.from && key <= r.to;
  }

  function dayKeyOf(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return U.dateKey(d);
  }

  /** Tag / category filter only — status and date filters are period-driven here. */
  function filtered(filter) {
    const f = filter || {};
    const s = TT.Store.get();
    return s.tasks.filter((t) => {
      if (f.tagIds && f.tagIds.length) {
        if (!f.tagIds.some((id) => t.tagIds.indexOf(id) >= 0)) return false;
      }
      if (f.categoryIds && f.categoryIds.length) {
        const hit = t.tagIds.some((tid) => {
          const tag = s.tags.find((x) => x.id === tid);
          return tag && f.categoryIds.indexOf(tag.categoryId) >= 0;
        });
        if (!hit) return false;
      }
      return true;
    });
  }

  function summary(r, filter) {
    const tasks = filtered(filter);

    const completed = tasks.filter((t) => t.completedAt && inRange(dayKeyOf(t.completedAt), r));
    const created = tasks.filter((t) => inRange(dayKeyOf(t.createdAt), r));
    const due = tasks.filter((t) => t.dueDate && inRange(t.dueDate, r));

    const dueDone = due.filter((t) => !!t.completedAt);
    const createdDone = created.filter((t) => !!t.completedAt);
    const slipped = due.filter((t) => !t.completedAt && t.status !== 'archived');

    return {
      completed: completed.length,
      created: created.length,
      due: due.length,
      slipped: slipped.length,
      dueBased: { n: dueDone.length, d: due.length },
      createdBased: { n: createdDone.length, d: created.length },
      rate: {
        due: due.length ? Math.round((dueDone.length / due.length) * 100) : null,
        created: created.length ? Math.round((createdDone.length / created.length) * 100) : null
      }
    };
  }

  function tagBreakdown(r, filter) {
    const s = TT.Store.get();
    const tasks = filtered(filter);

    const rows = s.tags.map((tag) => {
      const withTag = tasks.filter((t) => t.tagIds.indexOf(tag.id) >= 0);
      const completed = withTag.filter((t) => t.completedAt && inRange(dayKeyOf(t.completedAt), r)).length;
      const due = withTag.filter((t) => t.dueDate && inRange(t.dueDate, r)).length;
      const open = withTag.filter((t) => t.status === 'active').length;
      return { tag, category: TT.Model.categoryById(tag.categoryId), completed, due, open };
    }).filter((row) => row.completed || row.due || row.open);

    rows.sort((a, b) => b.completed - a.completed || b.due - a.due);

    const untagged = tasks.filter((t) => !t.tagIds.length);
    const untaggedCompleted = untagged.filter((t) => t.completedAt && inRange(dayKeyOf(t.completedAt), r)).length;

    if (untaggedCompleted || untagged.length) {
      rows.push({
        tag: { id: '__untagged', name: 'Untagged', categoryId: null },
        category: null,
        completed: untaggedCompleted,
        due: untagged.filter((t) => t.dueDate && inRange(t.dueDate, r)).length,
        open: untagged.filter((t) => t.status === 'active').length
      });
    }

    return rows;
  }

  function cellState(value, target) {
    if (value === null || value === undefined) return 'unknown';
    if (target === null || target === undefined) return 'none';
    if (value > target) return 'exceeded';
    if (value >= target) return 'met';
    return 'missed';
  }

  function cellLabel(unit, key) {
    if (unit === 'week') return key.slice(5);
    if (unit === 'month') return U.MONTHS_SHORT[Number(key.slice(5, 7)) - 1];
    const d = U.parseKey(key);
    return U.DAYS_SHORT[d.getDay()] + ' ' + d.getDate();
  }

  function counterSeries(r, filter) {
    const tasks = filtered(filter).filter((t) => t.kind === 'counter' && t.status !== 'archived');

    return tasks.map((task) => {
      const c = task.counter;
      const unit = TT.Counters.periodUnit(c);

      if (c.type === 'cumulative') {
        let delta = 0;
        Object.keys(c.history).forEach((k) => {
          if (inRange(k, r)) delta += Number(c.history[k]) || 0;
        });
        return {
          task,
          type: 'cumulative',
          unit: 'day',
          total: TT.Counters.total(c),
          delta,
          target: c.target,
          cells: []
        };
      }

      const keys = U.periodKeysInRange(unit, r.from, r.to);
      const currentKey = TT.Counters.periodKeyFor(c, new Date());
      const cells = keys.map((key) => {
        const isOpen = c.periodKey === key;
        const rec = c.periods && c.periods[key];
        const isFuture = key > currentKey;

        // Precedence: the live period reads from the counter itself; a closed
        // period prefers its stored record (which carries the target that was
        // in force then); anything older falls back to the numeric ledger.
        let value = null;
        let target = c.target;
        let outcome = null;

        if (isOpen) {
          value = c.value || 0;
        } else if (rec) {
          value = rec.value;
          target = rec.target;
          outcome = rec.outcome;
        } else if (key in c.history) {
          value = Number(c.history[key]);
        }

        return {
          key,
          label: cellLabel(unit, key),
          value,
          target,
          start: rec ? rec.start : null,
          end: rec ? rec.end : null,
          inferred: !!(rec && rec.inferred),
          recorded: !!rec,
          open: isOpen,
          future: isFuture,
          state: isFuture ? 'future' : (outcome || cellState(value, target))
        };
      });

      // Outcome counts only cover *closed* periods — the open one has no final
      // count yet, and calling a half-finished week "missed" would be wrong.
      const known = cells.filter((x) => !x.future && !x.open && x.value !== null);
      const met = known.filter((x) => x.state === 'met' || x.state === 'exceeded').length;
      const exceeded = known.filter((x) => x.state === 'exceeded').length;
      const missed = known.filter((x) => x.state === 'missed').length;
      const open = cells.find((x) => x.open) || null;

      return {
        task,
        type: c.type,
        unit,
        target: c.target,
        cells,
        open,
        met,
        missed,
        exceeded,
        inferred: known.some((x) => x.inferred),
        known: known.length,
        rate: known.length ? Math.round((met / known.length) * 100) : null
      };
    });
  }

  /* ------------------------------------------------------- v3 daily ledger */

  const TREND_AXES = ['day', 'week', 'month'];
  const TREND_METRICS = ['completed', 'counters'];

  /** The chart's default axis follows the selected stats period. */
  function defaultAxis(granularity) {
    if (granularity === 'year') return 'month';
    if (granularity === 'month') return 'week';
    return 'day';
  }

  function axisUnit(axis) {
    return TREND_AXES.indexOf(axis) >= 0 ? axis : 'day';
  }

  function bucketKey(day, axis) {
    if (axis === 'week') return U.isoWeekKey(day);
    if (axis === 'month') return U.monthKey(day);
    return day;
  }

  function bucketLabel(key, axis) {
    if (axis === 'month') return U.MONTHS_SHORT[Number(key.slice(5, 7)) - 1];
    if (axis === 'week') return 'W' + key.slice(6);
    const d = U.parseKey(key);
    return d.getDate() + ' ' + U.MONTHS_SHORT[d.getMonth()];
  }

  function bucketRange(key, axis) {
    if (axis === 'month') return { from: key + '-01', to: U.lastDayOfMonthKey(key) };
    if (axis === 'week') {
      const monday = U.weekKeyToMonday(key);
      return { from: monday, to: U.addDays(monday, 6) };
    }
    return { from: key, to: key };
  }

  /**
   * Counters in scope for the tag/category filter. Priority is never read
   * here: the review page has no priority breakdown and no priority trend.
   */
  function dailyCounterIds(filter) {
    return filtered(filter).filter((t) => t.kind === 'counter');
  }

  function dailyValue(rec, metric, counterIds) {
    if (!rec || typeof rec !== 'object') return 0;
    if (metric === 'counters') {
      let sum = 0;
      const counters = rec.counters || {};
      Object.keys(counters).forEach((id) => {
        if (counterIds.has(id)) sum += Math.max(0, Number(counters[id]) || 0);
      });
      return sum;
    }
    return Math.max(0, Math.round(Number(rec.completed) || 0));
  }

  /**
   * Bucketed series over state.daily for [r.from, r.to]. Empty buckets are
   * still emitted (as 0) so the x-axis stays continuous, but no history is
   * invented: a day with no recorded entry simply reads as zero.
   */
  function dailySeries(r, filter, axis, metric) {
    const unit = axisUnit(axis);
    const m = TREND_METRICS.indexOf(metric) >= 0 ? metric : 'completed';
    const counterIds = new Set(dailyCounterIds(filter).map((t) => t.id));
    const keys = U.periodKeysInRange(unit, r.from, r.to);
    const values = {};
    keys.forEach((k) => { values[k] = 0; });

    const daily = TT.Store.get().daily || {};
    Object.keys(daily).forEach((day) => {
      if (!U.isDateKey(day) || day < r.from || day > r.to) return;
      const bk = bucketKey(day, unit);
      if (!(bk in values)) return;
      values[bk] += dailyValue(daily[day], m, counterIds);
    });

    return keys.map((key) => {
      const bounds = bucketRange(key, unit);
      return {
        key,
        label: bucketLabel(key, unit),
        value: values[key],
        from: bounds.from < r.from ? r.from : bounds.from,
        to: bounds.to > r.to ? r.to : bounds.to
      };
    });
  }

  /**
   * Σ of each day's FINAL counter count over the period, per counter.
   * Deliberately not a net change: a daily counter sitting at 8 on three days
   * contributes 24, not 8. Only days with a recorded value are summed.
   */
  function dailyCounterSummary(r, filter) {
    const daily = TT.Store.get().daily || {};
    const inScope = dailyCounterIds(filter);
    const byId = {};
    inScope.forEach((t) => { byId[t.id] = { task: t, value: 0, days: 0 }; });
    let days = 0;

    Object.keys(daily).forEach((day) => {
      if (!U.isDateKey(day) || day < r.from || day > r.to) return;
      const rec = daily[day];
      if (!rec || typeof rec !== 'object') return;
      days++;
      const counters = rec.counters || {};
      Object.keys(counters).forEach((id) => {
        if (!byId[id]) return;
        const n = Number(counters[id]);
        if (!Number.isFinite(n)) return;
        byId[id].value += Math.max(0, Math.round(n));
        byId[id].days++;
      });
    });

    const rows = inScope.map((t) => byId[t.id]).filter((row) => row.days > 0);
    rows.sort((a, b) => (b.value - a.value) || a.task.title.localeCompare(b.task.title));
    return {
      rows,
      days,
      total: rows.reduce((n, row) => n + row.value, 0)
    };
  }

  TT.Stats = {
    GRANULARITIES,
    TREND_AXES,
    TREND_METRICS,
    defaultAxis,
    range,
    shift,
    inRange,
    summary,
    tagBreakdown,
    counterSeries,
    dailySeries,
    dailyCounterSummary,
    cellState,
    cellLabel,
    filtered
  };
})(typeof window !== 'undefined' ? window : globalThis);
