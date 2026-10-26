/* =========================================================================
   recurrence.js — repeating-task maths.
   The important bit: the Nth occurrence is computed from the series anchor,
   never from the previous (possibly clamped) date. Otherwise a task due on
   the 31st drifts: 31 Jan -> 28 Feb -> 28 Mar -> 28 Apr.
   ========================================================================= */
(function (global) {
  'use strict';

  const TT = global.TT;
  const U = TT.U;

  const MAX_CATCHUP = 500;

  function normalizeRule(input, dueDate) {
    const r = input || {};
    const anchor = dueDate ? Number(String(dueDate).slice(8, 10)) : new Date().getDate();

    return {
      every: Math.max(1, Math.round(Number(r.every) || 1)),
      unit: ['day', 'week', 'month'].indexOf(r.unit) >= 0 ? r.unit : 'week',
      anchorDay: U.clamp(anchor, 1, 31),
      endType: r.endType === 'until' ? 'until' : 'never',
      until: r.endType === 'until' && U.isDateKey(r.until) ? r.until : null,
      seriesId: r.seriesId || U.uid('series'),
      occurrenceIndex: Math.max(0, Math.round(Number(r.occurrenceIndex) || 0)),
      spawnedTaskId: null,
      skippedCount: 0,
      seriesEndedAt: null
    };
  }

  function nextDue(rule, fromKey) {
    const every = Math.max(1, Number(rule.every) || 1);
    if (rule.unit === 'day') return U.addDays(fromKey, every);
    if (rule.unit === 'week') return U.addDays(fromKey, every * 7);
    return U.addMonthsClamped(fromKey, every, rule.anchorDay);
  }

  /**
   * Walk forward to the first occurrence on or after `today`.
   * Returns how many occurrences were skipped so stats can stay honest about
   * weeks the app simply wasn't opened.
   */
  function advanceToFuture(rule, fromKey, today) {
    let next = nextDue(rule, fromKey);
    let skipped = 0;
    let guard = 0;
    while (next < today && guard++ < MAX_CATCHUP) {
      next = nextDue(rule, next);
      skipped++;
    }
    return { next, skipped };
  }

  function isEnded(rule, nextKey) {
    if (!rule) return false;
    return rule.endType === 'until' && !!rule.until && nextKey > rule.until;
  }

  /** Build the next instance of a completed recurring task, or null if the series ends. */
  function spawnNext(task, today) {
    const rule = task.recurrence;
    if (!rule) return null;

    const from = task.dueDate || today;
    const advanced = advanceToFuture(rule, from, today);
    if (isEnded(rule, advanced.next)) return null;

    const now = U.nowISO();
    return {
      id: U.uid('task'),
      title: task.title,
      notes: task.notes,
      tagIds: (task.tagIds || []).slice(),
      dueDate: advanced.next,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      status: 'active',
      archivedAt: null,
      kind: 'recurring',
      reminders: {
        onDue: !!(task.reminders && task.reminders.onDue),
        onRecurrence: !!(task.reminders && task.reminders.onRecurrence),
        counterTime: null
      },
      recurrence: Object.assign({}, rule, {
        occurrenceIndex: (rule.occurrenceIndex || 0) + 1,
        spawnedTaskId: null,
        skippedCount: advanced.skipped,
        seriesEndedAt: null
      }),
      counter: null
    };
  }

  /** Preview the next few dates for the editor. */
  function forecast(rule, fromKey, count) {
    const out = [];
    let cursor = fromKey;
    for (let i = 0; i < (count || 3); i++) {
      cursor = nextDue(rule, cursor);
      if (isEnded(rule, cursor)) break;
      out.push(cursor);
    }
    return out;
  }

  TT.Recur = {
    normalizeRule,
    nextDue,
    advanceToFuture,
    isEnded,
    spawnNext,
    forecast,
    describe: (rule) => U.humanRecurrence(rule)
  };
})(typeof window !== 'undefined' ? window : globalThis);
