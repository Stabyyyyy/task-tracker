/* =========================================================================
   model.js — task / tag / category operations and the filtering rules.
   Mutations always go through Store.commit so persistence and re-render are
   handled in one place.
   ========================================================================= */
(function (global) {
  'use strict';

  const TT = global.TT;
  const U = TT.U;

  function state() {
    return TT.Store.get();
  }

  function allTasks() {
    return state().tasks;
  }

  function taskById(id) {
    return allTasks().find((t) => t.id === id) || null;
  }

  function tagById(id) {
    return state().tags.find((t) => t.id === id) || null;
  }

  function categoryById(id) {
    return state().categories.find((c) => c.id === id) || null;
  }

  /**
   * The category that gives a card its colour bar: the one owning most of the
   * task's tags. Ties go to whichever category comes first in settings, so the
   * bar never flickers as tags are added. Untagged tasks get no category.
   */
  function primaryCategory(task) {
    if (!task || !task.tagIds || !task.tagIds.length) return null;
    const s = state();
    const counts = {};
    task.tagIds.forEach((id) => {
      const tag = s.tags.find((x) => x.id === id);
      if (!tag || !tag.categoryId) return;
      counts[tag.categoryId] = (counts[tag.categoryId] || 0) + 1;
    });

    let best = null;
    let bestCount = 0;
    s.categories.forEach((cat) => {
      const n = counts[cat.id] || 0;
      if (n > bestCount) {
        best = cat;
        bestCount = n;
      }
    });
    return best;
  }

  /* ------------------------------------------------------------- reminders */

  function normalizeReminders(input, kind) {
    const r = input || {};
    return {
      onDue: kind === 'counter' ? false : !!r.onDue,
      onRecurrence: kind === 'recurring' ? !!r.onRecurrence : false,
      counterTime: kind === 'counter' && r.counterTime ? r.counterTime : null
    };
  }

  /* ----------------------------------------------------------------- create */

  function createTask(draft) {
    const now = U.nowISO();
    const kind = draft.kind || 'plain';

    const task = {
      id: U.uid('task'),
      title: String(draft.title || '').trim(),
      notes: draft.notes || '',
      tagIds: (draft.tagIds || []).slice(),
      dueDate: kind === 'counter' ? null : (draft.dueDate || null),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      status: 'active',
      archivedAt: null,
      kind,
      reminders: normalizeReminders(draft.reminders, kind),
      recurrence: null,
      counter: null
    };

    if (kind === 'recurring') {
      if (!task.dueDate) task.dueDate = U.todayKey();
      task.recurrence = TT.Recur.normalizeRule(draft.recurrence, task.dueDate);
    }

    if (kind === 'counter') {
      task.counter = TT.Counters.newCounter(draft.counter);
    }

    TT.Store.commit((s) => {
      s.tasks.push(task);
    });
    return task;
  }

  /* ----------------------------------------------------------------- update */

  function updateTask(id, draft) {
    const kind = draft.kind || 'plain';
    TT.Store.commit((s) => {
      const t = s.tasks.find((x) => x.id === id);
      if (!t) return;

      const previousKind = t.kind;
      t.title = String(draft.title || '').trim();
      t.notes = draft.notes || '';
      t.tagIds = (draft.tagIds || []).slice();
      t.kind = kind;
      t.dueDate = kind === 'counter' ? null : (draft.dueDate || null);
      t.updatedAt = U.nowISO();
      t.reminders = normalizeReminders(draft.reminders, kind);

      if (kind === 'recurring') {
        if (!t.dueDate) t.dueDate = U.todayKey();
        const rule = TT.Recur.normalizeRule(draft.recurrence, t.dueDate);
        if (previousKind === 'recurring' && t.recurrence) {
          // Keep series identity, re-anchor from the instance currently open.
          rule.seriesId = t.recurrence.seriesId;
          rule.occurrenceIndex = t.recurrence.occurrenceIndex;
          rule.spawnedTaskId = t.recurrence.spawnedTaskId;
        }
        t.recurrence = rule;
      } else {
        t.recurrence = null;
      }

      if (kind === 'counter') {
        const next = TT.Counters.newCounter(draft.counter);
        if (previousKind === 'counter' && t.counter) {
          // History is worth keeping across a style change; the open period is
          // not, because a daily key makes no sense to a weekly counter.
          const sameShape = t.counter.type === next.type &&
            (t.counter.period || null) === (next.period || null);
          next.history = t.counter.history;
          next.periods = t.counter.periods || {};
          next.log = t.counter.log;
          if (sameShape) {
            next.value = t.counter.value;
            next.periodKey = t.counter.periodKey;
          }
        }
        t.counter = next;
      } else {
        t.counter = null;
      }
    });
  }

  /* ------------------------------------------------------------ completion */

  function isUntouched(task) {
    return task.status === 'active' &&
      !task.completedAt &&
      task.createdAt === task.updatedAt;
  }

  /**
   * Complete / un-complete. Completing a recurring task keeps the instance as
   * a record and spawns exactly one successor.
   */
  function toggleComplete(id) {
    const task = taskById(id);
    if (!task) return { ok: false };
    // Archived tasks are not completable — restore first.
    if (task.status === 'archived') return { ok: false };

    if (task.status === 'done') {
      const childId = task.recurrence && task.recurrence.spawnedTaskId;
      let removedChild = false;
      let childKept = false;

      TT.Store.commit((s) => {
        const t = s.tasks.find((x) => x.id === id);
        if (!t) return;
        t.status = 'active';
        t.completedAt = null;
        t.updatedAt = U.nowISO();
        if (t.recurrence) t.recurrence.seriesEndedAt = null;

        if (childId) {
          const child = s.tasks.find((x) => x.id === childId);
          if (child && isUntouched(child)) {
            s.tasks = s.tasks.filter((x) => x.id !== childId);
            t.recurrence.spawnedTaskId = null;
            removedChild = true;
          } else if (child) {
            childKept = true;
          }
        }
      });

      return { ok: true, completed: false, removedChild, childKept };
    }

    let spawned = null;
    let ended = false;

    TT.Store.commit((s) => {
      const t = s.tasks.find((x) => x.id === id);
      if (!t) return;
      t.status = 'done';
      t.completedAt = U.nowISO();
      t.updatedAt = t.completedAt;

      if (t.kind === 'recurring' && t.recurrence && !t.recurrence.spawnedTaskId) {
        spawned = TT.Recur.spawnNext(t, U.todayKey());
        if (spawned) {
          s.tasks.push(spawned);
          t.recurrence.spawnedTaskId = spawned.id;
        } else {
          t.recurrence.seriesEndedAt = U.nowISO();
          ended = true;
        }
      }
    });

    return { ok: true, completed: true, spawnedId: spawned && spawned.id, ended };
  }

  function archiveTask(id) {
    TT.Store.commit((s) => {
      const t = s.tasks.find((x) => x.id === id);
      if (!t) return;
      t.status = 'archived';
      t.archivedAt = U.nowISO();
      t.updatedAt = t.archivedAt;
    });
  }

  function restoreTask(id) {
    TT.Store.commit((s) => {
      const t = s.tasks.find((x) => x.id === id);
      if (!t) return;
      t.status = t.completedAt ? 'done' : 'active';
      t.archivedAt = null;
      t.updatedAt = U.nowISO();
    });
  }

  function deleteTask(id) {
    TT.Store.commit((s) => {
      s.tasks = s.tasks.filter((x) => x.id !== id);
      s.tasks.forEach((t) => {
        if (t.recurrence && t.recurrence.spawnedTaskId === id) {
          t.recurrence.spawnedTaskId = null;
        }
      });
    });
  }

  /* --------------------------------------------------------------- filters */

  function emptyFilters() {
    return {
      search: '',
      tagIds: [],
      categoryIds: [],
      dueFrom: '',
      dueTo: '',
      status: 'active'
    };
  }

  function matches(task, f) {
    const s = state();

    if (f.status === 'active' && task.status !== 'active') return false;
    if (f.status === 'done' && task.status !== 'done') return false;
    if (f.status === 'archived' && task.status !== 'archived') return false;
    if (f.status === 'all' && task.status === 'archived') return false;

    if (f.tagIds && f.tagIds.length) {
      if (!f.tagIds.some((id) => task.tagIds.indexOf(id) >= 0)) return false;
    }

    if (f.categoryIds && f.categoryIds.length) {
      const hit = task.tagIds.some((tid) => {
        const tag = s.tags.find((x) => x.id === tid);
        return tag && f.categoryIds.indexOf(tag.categoryId) >= 0;
      });
      if (!hit) return false;
    }

    if (f.dueFrom) {
      if (!task.dueDate || task.dueDate < f.dueFrom) return false;
    }
    if (f.dueTo) {
      if (!task.dueDate || task.dueDate > f.dueTo) return false;
    }

    if (f.search) {
      const needle = f.search.toLowerCase();
      const haystack = (task.title + ' ' + (task.notes || '')).toLowerCase();
      if (haystack.indexOf(needle) < 0) return false;
    }

    return true;
  }

  function compare(a, b) {
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  }

  /** Alphabetically first tag name — stable even when tags are reordered. */
  function firstTagName(task) {
    const names = (task.tagIds || [])
      .map((id) => tagById(id))
      .filter(Boolean)
      .map((t) => t.name)
      .sort();
    return names.length ? names[0] : null;
  }

  const SORTS = ['due', 'category', 'tag', 'created'];

  function compareBy(sortBy) {
    if (sortBy === 'category') {
      return (a, b) => {
        const ca = primaryCategory(a);
        const cb = primaryCategory(b);
        if (ca && cb && ca.name !== cb.name) return ca.name < cb.name ? -1 : 1;
        if (ca && !cb) return -1;
        if (!ca && cb) return 1;
        return compare(a, b);
      };
    }

    if (sortBy === 'tag') {
      return (a, b) => {
        const ta = firstTagName(a);
        const tb = firstTagName(b);
        if (ta && tb && ta !== tb) return ta < tb ? -1 : 1;
        if (ta && !tb) return -1;
        if (!ta && tb) return 1;
        return compare(a, b);
      };
    }

    if (sortBy === 'created') {
      // Newest first — "what did I just add" is the useful direction here.
      return (a, b) => {
        if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
        return compare(a, b);
      };
    }

    return compare;
  }

  function visibleTasks(filters, sortBy) {
    return allTasks().filter((t) => matches(t, filters)).sort(compareBy(sortBy));
  }

  function isOverdue(task, today) {
    const ref = today || U.todayKey();
    return task.status === 'active' && !!task.dueDate && task.dueDate < ref;
  }

  function bucketOf(task, today) {
    const ref = today || U.todayKey();
    if (!task.dueDate) return 'none';
    const delta = U.diffDays(task.dueDate, ref);
    if (delta < 0) return 'overdue';
    if (delta === 0) return 'today';
    if (delta === 1) return 'tomorrow';
    if (delta <= 7) return 'week';
    return 'later';
  }

  const BUCKET_LABELS = {
    overdue: 'Overdue',
    today: 'Today',
    tomorrow: 'Tomorrow',
    week: 'Next 7 days',
    later: 'Later',
    none: 'No due date'
  };

  function groupTasks(list, today) {
    const order = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none'];
    const groups = {};
    list.forEach((t) => {
      const key = t.kind === 'counter' ? 'counters' : bucketOf(t, today);
      (groups[key] = groups[key] || []).push(t);
    });
    const out = [];
    if (groups.counters) out.push({ key: 'counters', label: 'Counters', tasks: groups.counters });
    order.forEach((key) => {
      if (groups[key] && groups[key].length) {
        out.push({ key, label: BUCKET_LABELS[key], tasks: groups[key] });
      }
    });
    return out;
  }

  /**
   * Group by category instead of by due bucket. Counters and repeating tasks
   * stay in their own category rather than being pulled into a separate block,
   * which is the point of this view.
   */
  function groupTasksByCategory(list) {
    const s = state();
    const buckets = {};
    list.forEach((t) => {
      const cat = primaryCategory(t);
      const key = cat ? cat.id : '__none';
      (buckets[key] = buckets[key] || []).push(t);
    });

    const out = [];
    s.categories.forEach((cat) => {
      if (buckets[cat.id] && buckets[cat.id].length) {
        out.push({ key: cat.id, label: cat.name, color: cat.color, tasks: buckets[cat.id] });
      }
    });
    if (buckets.__none && buckets.__none.length) {
      out.push({ key: '__none', label: 'Uncategorised', color: 'slate', tasks: buckets.__none });
    }
    return out;
  }

  /* -------------------------------------------------------------- counters */

  function countersMatching(filters) {
    const f = Object.assign(emptyFilters(), filters);
    return allTasks()
      .filter((t) => t.kind === 'counter' && matches(t, Object.assign({}, f, { status: 'active' })))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  /* ---------------------------------------------------- categories and tags */

  function tagUsage(tagId) {
    return allTasks().filter((t) => t.tagIds.indexOf(tagId) >= 0).length;
  }

  function categoryUsage(categoryId) {
    const s = state();
    const tagIds = s.tags.filter((t) => t.categoryId === categoryId).map((t) => t.id);
    const tasks = allTasks().filter((t) => t.tagIds.some((id) => tagIds.indexOf(id) >= 0)).length;
    return { tags: tagIds.length, tasks };
  }

  function addCategory(name, color) {
    const cat = {
      id: U.uid('cat'),
      name: String(name || '').trim() || 'Untitled',
      color: color || 'blue'
    };
    TT.Store.commit((s) => {
      s.categories.push(cat);
    });
    return cat;
  }

  function updateCategory(id, patch) {
    TT.Store.commit((s) => {
      const c = s.categories.find((x) => x.id === id);
      if (!c) return;
      if (patch.name != null) c.name = String(patch.name).trim() || c.name;
      if (patch.color) c.color = patch.color;
    });
  }

  /** strategy: { mode:'move', toId } | { mode:'delete' } */
  function deleteCategory(id, strategy) {
    TT.Store.commit((s) => {
      const affectedTags = s.tags.filter((t) => t.categoryId === id);
      const affectedTagIds = affectedTags.map((t) => t.id);

      if (strategy && strategy.mode === 'move' && strategy.toId) {
        affectedTags.forEach((t) => {
          t.categoryId = strategy.toId;
        });
      } else {
        s.tags = s.tags.filter((t) => t.categoryId !== id);
        s.tasks.forEach((t) => {
          t.tagIds = t.tagIds.filter((tid) => affectedTagIds.indexOf(tid) < 0);
        });
      }
      s.categories = s.categories.filter((c) => c.id !== id);
    });
  }

  function addTag(name, categoryId) {
    const tag = {
      id: U.uid('tag'),
      name: String(name || '').trim() || 'Untitled',
      categoryId
    };
    TT.Store.commit((s) => {
      s.tags.push(tag);
    });
    return tag;
  }

  function updateTag(id, patch) {
    TT.Store.commit((s) => {
      const t = s.tags.find((x) => x.id === id);
      if (!t) return;
      if (patch.name != null) t.name = String(patch.name).trim() || t.name;
      if (patch.categoryId) t.categoryId = patch.categoryId;
    });
  }

  function deleteTag(id) {
    TT.Store.commit((s) => {
      s.tags = s.tags.filter((t) => t.id !== id);
      s.tasks.forEach((t) => {
        t.tagIds = t.tagIds.filter((tid) => tid !== id);
      });
    });
  }

  /* ------------------------------------------------------------------ misc */

  function counts() {
    const list = allTasks();
    const today = U.todayKey();
    return {
      active: list.filter((t) => t.status === 'active').length,
      done: list.filter((t) => t.status === 'done').length,
      archived: list.filter((t) => t.status === 'archived').length,
      overdue: list.filter((t) => isOverdue(t, today)).length,
      today: list.filter((t) => t.status === 'active' && t.dueDate === today).length,
      counters: list.filter((t) => t.kind === 'counter' && t.status === 'active').length
    };
  }

  TT.Model = {
    allTasks,
    taskById,
    tagById,
    categoryById,
    primaryCategory,
    createTask,
    updateTask,
    toggleComplete,
    archiveTask,
    restoreTask,
    deleteTask,
    emptyFilters,
    matches,
    visibleTasks,
    compareBy,
    SORTS,
    isOverdue,
    bucketOf,
    groupTasks,
    groupTasksByCategory,
    BUCKET_LABELS,
    countersMatching,
    tagUsage,
    categoryUsage,
    addCategory,
    updateCategory,
    deleteCategory,
    addTag,
    updateTag,
    deleteTag,
    counts
  };
})(typeof window !== 'undefined' ? window : globalThis);
