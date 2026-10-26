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
        let value = null;
        if (isOpen) value = c.value || 0;
        else if (key in c.history) value = Number(c.history[key]);
        const isFuture = key > currentKey;
        return {
          key,
          label: cellLabel(unit, key),
          value,
          target: c.target,
          future: isFuture,
          state: isFuture ? 'future' : cellState(value, c.target)
        };
      });

      const known = cells.filter((x) => !x.future && x.value !== null);
      const met = known.filter((x) => x.state === 'met' || x.state === 'exceeded').length;

      return {
        task,
        type: c.type,
        unit,
        target: c.target,
        cells,
        met,
        known: known.length,
        rate: known.length ? Math.round((met / known.length) * 100) : null
      };
    });
  }

  TT.Stats = {
    GRANULARITIES,
    range,
    shift,
    inRange,
    summary,
    tagBreakdown,
    counterSeries,
    cellState,
    cellLabel,
    filtered
  };
})(typeof window !== 'undefined' ? window : globalThis);
