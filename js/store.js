/* =========================================================================
   store.js — the single source of truth.
   Owns localStorage persistence, schema migration, subscriptions, and the
   import/export contract. Nothing else in the app writes to localStorage.
   ========================================================================= */
(function (global) {
  'use strict';

  const TT = global.TT;
  const U = TT.U;

  const KEY = 'tasktracker.v1';
  const PREIMPORT_KEY = 'tasktracker.preimport';
  // v2 added counter.periods (per-period target + outcome snapshots) and
  // settings.listView. Both are additive, so v1 data migrates in place.
  const APP_VERSION = 2;

  const DEFAULT_CATEGORIES = [
    { id: 'cat_work', name: 'Work', color: 'blue' },
    { id: 'cat_life', name: 'Life', color: 'green' },
    { id: 'cat_study', name: 'Study', color: 'purple' }
  ];

  const DEFAULT_TAGS = [
    { id: 'tag_deepwork', name: 'Deep work', categoryId: 'cat_work' },
    { id: 'tag_admin', name: 'Admin', categoryId: 'cat_work' },
    { id: 'tag_home', name: 'Home', categoryId: 'cat_life' },
    { id: 'tag_health', name: 'Health', categoryId: 'cat_life' },
    { id: 'tag_reading', name: 'Reading', categoryId: 'cat_study' }
  ];

  const CATEGORY_COLORS = ['blue', 'green', 'purple', 'orange', 'pink', 'teal', 'red', 'slate'];
  const STATUSES = ['active', 'done', 'archived'];
  const KINDS = ['plain', 'recurring', 'counter'];
  const COUNTER_TYPES = ['daily', 'cumulative', 'periodic'];
  const OUTCOMES = ['met', 'missed', 'exceeded', 'none', 'unknown'];
  const UNITS = ['day', 'week', 'month'];

  let state = null;
  const subscribers = [];

  /* ------------------------------------------------------------- defaults */

  function defaultSettings() {
    return {
      weekStart: 1,
      defaultReminderTime: '09:00',
      notificationsEnabled: false,
      theme: 'system',
      notified: {},
      lastBackupAt: null,
      listView: { groupBy: 'date', sortBy: 'due' }
    };
  }

  function blankState() {
    const now = U.nowISO();
    return {
      version: APP_VERSION,
      tasks: [],
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      tags: DEFAULT_TAGS.map((t) => ({ ...t })),
      settings: defaultSettings(),
      meta: { createdAt: now, updatedAt: now, appVersion: APP_VERSION }
    };
  }

  /* --------------------------------------------------------------- loading */

  function readRaw() {
    try {
      return global.localStorage.getItem(KEY);
    } catch (err) {
      console.error('localStorage unavailable', err);
      return null;
    }
  }

  function normalizeListView(settings) {
    const d = defaultSettings().listView;
    const lv = settings.listView && typeof settings.listView === 'object' ? settings.listView : {};
    settings.listView = {
      groupBy: lv.groupBy === 'category' ? 'category' : 'date',
      sortBy: ['due', 'category', 'tag', 'created'].indexOf(lv.sortBy) >= 0 ? lv.sortBy : d.sortBy
    };
  }

  /**
   * v1 -> v2. Rebuild a per-period record for every closed period that only has
   * a number in `history`. Targets were never stored back then, so the
   * counter's current target is the only value available; those records are
   * flagged `inferred` so the review page can say so rather than pretend.
   * Idempotent — existing records are never touched.
   */
  function migrateCounters(next) {
    if (!TT.Counters || !TT.Counters.writeRecord) return;
    next.tasks.forEach((task) => {
      if (!task || task.kind !== 'counter' || !task.counter) return;
      const c = task.counter;
      if (!c.periods || typeof c.periods !== 'object') c.periods = {};
      if (c.type === 'cumulative' || !c.history) return;

      Object.keys(c.history).forEach((key) => {
        if (key === c.periodKey) return; // still open, not a closed period
        if (key in c.periods) return;
        const rec = TT.Counters.writeRecord(c, key);
        if (rec) rec.inferred = true;
      });
    });
  }

  function migrate(raw) {
    const base = blankState();
    if (!raw || typeof raw !== 'object') return base;

    const next = {
      version: APP_VERSION,
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      categories: Array.isArray(raw.categories) && raw.categories.length ? raw.categories : base.categories,
      tags: Array.isArray(raw.tags) ? raw.tags : base.tags,
      settings: Object.assign(defaultSettings(), raw.settings || {}),
      meta: Object.assign(base.meta, raw.meta || {})
    };
    if (!next.settings.notified || typeof next.settings.notified !== 'object') {
      next.settings.notified = {};
    }
    normalizeListView(next.settings);
    migrateCounters(next);
    return next;
  }

  function load() {
    const raw = readRaw();
    if (!raw) {
      state = blankState();
      persist();
      return state;
    }
    try {
      const parsed = JSON.parse(raw);
      state = migrate(parsed);
      // Write the upgraded shape back once, so v1 data is migrated in place
      // instead of being re-migrated on every open.
      if (!parsed || parsed.version !== APP_VERSION) persist();
    } catch (err) {
      console.error('Stored data was unreadable, starting fresh.', err);
      state = blankState();
    }
    return state;
  }

  /* ------------------------------------------------------------ persistence */

  function persist() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error('save failed', err);
      if (TT.UI) {
        TT.UI.toast('Could not save — browser storage may be full.', 'error', 6000);
      }
      return false;
    }
  }

  function get() {
    return state;
  }

  function subscribe(fn) {
    subscribers.push(fn);
    return function unsubscribe() {
      const i = subscribers.indexOf(fn);
      if (i >= 0) subscribers.splice(i, 1);
    };
  }

  function notify() {
    subscribers.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.error('subscriber failed', err);
      }
    });
  }

  /**
   * Every mutation goes through here: mutate, stamp, persist, notify.
   * Persisting synchronously keeps things simple — the payload is small and
   * it removes any "lost update on tab close" window.
   */
  function commit(mutator) {
    if (!state) return;
    mutator(state);
    state.meta.updatedAt = U.nowISO();
    persist();
    notify();
  }

  /* -------------------------------------------------------------- settings */

  function setSetting(key, value) {
    commit((s) => {
      s.settings[key] = value;
    });
  }

  /* ---------------------------------------------------------- export/import */

  function buildEnvelope() {
    return {
      app: 'tasktracker',
      version: APP_VERSION,
      exportedAt: U.nowISO(),
      state: state
    };
  }

  function exportJSON() {
    return JSON.stringify(buildEnvelope(), null, 2);
  }

  function isoOr(value, fallback) {
    if (typeof value === 'string') {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    return fallback;
  }

  function finiteOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  const HISTORY_KEY = /^(\d{4}-\d{2}-\d{2}|\d{4}-W\d{2}|\d{4}-\d{2})$/;

  /**
   * Validate an imported envelope without touching live state.
   * Returns { ok, errors[], state } — on any error, `state` is null and
   * nothing has been written.
   */
  function validateImport(parsed) {
    const errors = [];
    const add = (path, message) => {
      if (errors.length < 12) errors.push(path + ' — ' + message);
    };

    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, errors: ['That file is not valid JSON.'] };
    }
    if (parsed.app !== 'tasktracker') {
      add('app', 'this file was not exported by Task Tracker');
    }
    const version = Number(parsed.version);
    if (!Number.isFinite(version)) {
      add('version', 'missing or not a number');
    } else if (version > APP_VERSION) {
      add('version', 'exported by a newer version of the app (' + version + ')');
    }

    const raw = parsed.state;
    if (!raw || typeof raw !== 'object') {
      add('state', 'missing');
      return { ok: false, errors };
    }
    if (!Array.isArray(raw.tasks)) add('state.tasks', 'must be an array');

    const categories = [];
    const categoryIds = new Set();
    (Array.isArray(raw.categories) ? raw.categories : []).forEach((c, i) => {
      if (!c || typeof c !== 'object') return add('categories[' + i + ']', 'not an object');
      const id = typeof c.id === 'string' ? c.id.trim() : '';
      if (!id) return add('categories[' + i + '].id', 'missing');
      if (categoryIds.has(id)) return add('categories[' + i + '].id', 'duplicate id');
      categoryIds.add(id);
      categories.push({
        id,
        name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : 'Untitled',
        color: CATEGORY_COLORS.indexOf(c.color) >= 0 ? c.color : 'blue'
      });
    });

    const tags = [];
    const tagIds = new Set();
    (Array.isArray(raw.tags) ? raw.tags : []).forEach((t, i) => {
      if (!t || typeof t !== 'object') return add('tags[' + i + ']', 'not an object');
      const id = typeof t.id === 'string' ? t.id.trim() : '';
      if (!id) return add('tags[' + i + '].id', 'missing');
      if (tagIds.has(id)) return add('tags[' + i + '].id', 'duplicate id');
      if (!categoryIds.has(t.categoryId)) {
        return add('tags[' + i + '].categoryId', 'points at a category that does not exist');
      }
      tagIds.add(id);
      tags.push({
        id,
        name: typeof t.name === 'string' && t.name.trim() ? t.name.trim() : 'Untitled',
        categoryId: t.categoryId
      });
    });

    const tasks = [];
    const taskIds = new Set();
    (Array.isArray(raw.tasks) ? raw.tasks : []).forEach((t, i) => {
      const path = 'tasks[' + i + ']';
      if (!t || typeof t !== 'object') return add(path, 'not an object');

      const id = typeof t.id === 'string' ? t.id.trim() : '';
      if (!id) return add(path + '.id', 'missing');
      if (taskIds.has(id)) return add(path + '.id', 'duplicate id');
      taskIds.add(id);

      const title = typeof t.title === 'string' ? t.title.trim() : '';
      if (!title) return add(path + '.title', 'must be a non-empty string');

      const status = STATUSES.indexOf(t.status) >= 0 ? t.status : null;
      if (!status) return add(path + '.status', 'must be active, done or archived');

      const kind = KINDS.indexOf(t.kind) >= 0 ? t.kind : 'plain';

      if (t.dueDate != null && !U.isDateKey(t.dueDate)) {
        return add(path + '.dueDate', 'not a real calendar date (expected YYYY-MM-DD)');
      }

      const taskTagIds = [];
      if (Array.isArray(t.tagIds)) {
        t.tagIds.forEach((tid) => {
          if (!tagIds.has(tid)) {
            add(path + '.tagIds', 'references unknown tag "' + tid + '"');
          } else if (taskTagIds.indexOf(tid) < 0) {
            taskTagIds.push(tid);
          }
        });
      }

      const createdAt = isoOr(t.createdAt, U.nowISO());
      const updatedAt = isoOr(t.updatedAt, createdAt);

      const task = {
        id,
        title,
        notes: typeof t.notes === 'string' ? t.notes : '',
        tagIds: taskTagIds,
        dueDate: t.dueDate || null,
        createdAt,
        updatedAt,
        completedAt: status === 'done' ? isoOr(t.completedAt, updatedAt) : null,
        status,
        archivedAt: status === 'archived' ? isoOr(t.archivedAt, updatedAt) : null,
        kind,
        reminders: {
          onDue: !!(t.reminders && t.reminders.onDue),
          onRecurrence: !!(t.reminders && t.reminders.onRecurrence),
          counterTime: t.reminders && /^\d{1,2}:\d{2}$/.test(t.reminders.counterTime)
            ? t.reminders.counterTime
            : null
        },
        recurrence: null,
        counter: null
      };

      if (kind === 'recurring') {
        const r = t.recurrence;
        if (!r || typeof r !== 'object') {
          add(path + '.recurrence', 'required when kind is "recurring"');
        } else if (UNITS.indexOf(r.unit) < 0) {
          add(path + '.recurrence.unit', 'must be day, week or month');
        } else {
          task.recurrence = {
            every: Math.max(1, Math.round(finiteOr(r.every, 1))),
            unit: r.unit,
            anchorDay: U.clamp(Math.round(finiteOr(r.anchorDay, 1)), 1, 31),
            endType: r.endType === 'until' ? 'until' : 'never',
            until: U.isDateKey(r.until) ? r.until : null,
            seriesId: typeof r.seriesId === 'string' && r.seriesId ? r.seriesId : U.uid('series'),
            occurrenceIndex: Math.max(0, Math.round(finiteOr(r.occurrenceIndex, 0))),
            spawnedTaskId: typeof r.spawnedTaskId === 'string' ? r.spawnedTaskId : null,
            skippedCount: Math.max(0, Math.round(finiteOr(r.skippedCount, 0))),
            seriesEndedAt: r.seriesEndedAt ? isoOr(r.seriesEndedAt, null) : null
          };
          if (task.recurrence.endType === 'until' && !task.recurrence.until) {
            add(path + '.recurrence.until', 'end type is "until" but no date is set');
          }
        }
      }

      if (kind === 'counter') {
        const c = t.counter;
        if (!c || typeof c !== 'object') {
          add(path + '.counter', 'required when kind is "counter"');
        } else if (COUNTER_TYPES.indexOf(c.type) < 0) {
          add(path + '.counter.type', 'must be daily, cumulative or periodic');
        } else {
          const history = {};
          if (c.history && typeof c.history === 'object') {
            Object.keys(c.history).forEach((hkey) => {
              if (!HISTORY_KEY.test(hkey)) {
                add(path + '.counter.history["' + hkey + '"]', 'not a valid period key');
                return;
              }
              const v = Number(c.history[hkey]);
              if (!Number.isFinite(v)) {
                add(path + '.counter.history["' + hkey + '"]', 'not a number');
                return;
              }
              if (c.type !== 'cumulative' && v < 0) {
                add(path + '.counter.history["' + hkey + '"]', 'cannot be negative');
                return;
              }
              history[hkey] = v;
            });
          }
          // v2 period records are optional: a v1 export simply has none, and a
          // malformed record is dropped rather than failing the whole import.
          const periods = {};
          if (c.type !== 'cumulative' && c.periods && typeof c.periods === 'object') {
            Object.keys(c.periods).forEach((pkey) => {
              if (!HISTORY_KEY.test(pkey)) return;
              const rec = c.periods[pkey];
              if (!rec || typeof rec !== 'object') return;
              const v = Number(rec.value);
              if (!Number.isFinite(v)) return;
              periods[pkey] = {
                start: U.isDateKey(rec.start) ? rec.start : null,
                end: U.isDateKey(rec.end) ? rec.end : null,
                value: Math.max(0, v),
                target: rec.target == null || rec.target === '' ? null : Math.max(0, finiteOr(rec.target, 0)),
                outcome: OUTCOMES.indexOf(rec.outcome) >= 0 ? rec.outcome : 'unknown',
                inferred: !!rec.inferred
              };
            });
          }

          task.counter = {
            type: c.type,
            period: c.type === 'periodic' ? (c.period === 'month' ? 'month' : 'week') : null,
            target: c.target == null || c.target === '' ? null : Math.max(0, finiteOr(c.target, 0)),
            value: Math.max(0, finiteOr(c.value, 0)),
            periodKey: HISTORY_KEY.test(String(c.periodKey)) ? c.periodKey : null,
            history,
            periods,
            log: []
          };
        }
      }

      tasks.push(task);
    });

    if (errors.length) return { ok: false, errors };

    const settings = Object.assign(defaultSettings(), raw.settings || {});
    settings.notified = raw.settings && raw.settings.notified && typeof raw.settings.notified === 'object'
      ? raw.settings.notified
      : {};

    const nextState = {
      version: APP_VERSION,
      tasks,
      categories: categories.length ? categories : DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      tags,
      settings,
      meta: {
        createdAt: isoOr(raw.meta && raw.meta.createdAt, U.nowISO()),
        updatedAt: U.nowISO(),
        appVersion: APP_VERSION
      }
    };

    // Drop dangling references so the app never renders a broken link.
    nextState.tasks.forEach((t) => {
      if (t.recurrence && t.recurrence.spawnedTaskId &&
        !nextState.tasks.some((x) => x.id === t.recurrence.spawnedTaskId)) {
        t.recurrence.spawnedTaskId = null;
      }
    });

    // A v1 backup has history but no period records — build them here too, so
    // importing an old file lands in the same shape as loading old localStorage.
    migrateCounters(nextState);

    return { ok: true, errors: [], state: nextState };
  }

  function importState(nextState) {
    try {
      global.localStorage.setItem(PREIMPORT_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('could not snapshot pre-import state', err);
    }
    state = nextState;
    persist();
    notify();
  }

  function hasImportSnapshot() {
    try {
      return !!global.localStorage.getItem(PREIMPORT_KEY);
    } catch (err) {
      return false;
    }
  }

  function undoImport() {
    try {
      const raw = global.localStorage.getItem(PREIMPORT_KEY);
      if (!raw) return false;
      state = migrate(JSON.parse(raw));
      global.localStorage.removeItem(PREIMPORT_KEY);
      persist();
      notify();
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  function resetAll() {
    state = blankState();
    persist();
    notify();
  }

  /* ------------------------------------------------------------ sample data */

  function loadSample() {
    const today = U.todayKey();
    const now = U.nowISO();
    const base = blankState();

    const mk = (patch) => Object.assign({
      id: U.uid('task'),
      title: '',
      notes: '',
      tagIds: [],
      dueDate: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      status: 'active',
      archivedAt: null,
      kind: 'plain',
      reminders: { onDue: false, onRecurrence: false, counterTime: null },
      recurrence: null,
      counter: null
    }, patch);

    const waterHistory = {};
    for (let i = 8; i >= 1; i--) {
      const k = U.addDays(today, -i);
      waterHistory[k] = [8, 6, 8, 5, 7, 8, 8, 4][i % 8];
    }

    const tasks = [
      mk({
        title: 'Finish the quarterly report',
        notes: 'Numbers from finance, plus the summary slide.',
        tagIds: ['tag_deepwork'],
        dueDate: U.addDays(today, -2),
        reminders: { onDue: true, onRecurrence: false, counterTime: null }
      }),
      mk({
        title: 'Call the dentist',
        tagIds: ['tag_health'],
        dueDate: today
      }),
      mk({
        title: 'Read 20 pages',
        tagIds: ['tag_reading'],
        dueDate: U.addDays(today, 1)
      }),
      mk({
        title: 'Renew the domain name',
        tagIds: ['tag_admin'],
        dueDate: U.addDays(today, 4)
      }),
      mk({
        title: 'Weekly review',
        notes: 'Clear the inbox, plan next week.',
        tagIds: ['tag_deepwork'],
        dueDate: today,
        kind: 'recurring',
        reminders: { onDue: false, onRecurrence: true, counterTime: null },
        recurrence: {
          every: 1,
          unit: 'week',
          anchorDay: Number(today.slice(8, 10)),
          endType: 'never',
          until: null,
          seriesId: U.uid('series'),
          occurrenceIndex: 3,
          spawnedTaskId: null,
          skippedCount: 0,
          seriesEndedAt: null
        }
      }),
      mk({
        title: 'Drink water',
        tagIds: ['tag_health'],
        kind: 'counter',
        reminders: { onDue: false, onRecurrence: false, counterTime: '18:00' },
        counter: {
          type: 'daily',
          period: null,
          target: 8,
          value: 3,
          periodKey: today,
          history: Object.assign({}, waterHistory, { [today]: 3 }),
          log: []
        }
      }),
      mk({
        title: 'Books read this year',
        tagIds: ['tag_reading'],
        kind: 'counter',
        counter: {
          type: 'cumulative',
          period: null,
          target: 12,
          value: 0,
          periodKey: today,
          history: { [U.addDays(today, -40)]: 2, [U.addDays(today, -18)]: 1, [U.addDays(today, -3)]: 3 },
          log: []
        }
      }),
      mk({
        title: 'Guitar practice',
        tagIds: ['tag_home'],
        kind: 'counter',
        reminders: { onDue: false, onRecurrence: false, counterTime: '20:00' },
        counter: {
          type: 'periodic',
          period: 'week',
          target: 3,
          value: 1,
          periodKey: U.isoWeekKey(today),
          history: {
            [U.isoWeekKey(U.addDays(today, -14))]: 5,
            [U.isoWeekKey(U.addDays(today, -7))]: 3
          },
          log: []
        }
      }),
      mk({
        title: 'Old tax paperwork',
        tagIds: ['tag_admin'],
        dueDate: U.addDays(today, -30),
        status: 'done',
        completedAt: now,
        kind: 'plain'
      })
    ];

    tasks[tasks.length - 1].status = 'archived';
    tasks[tasks.length - 1].archivedAt = now;
    tasks[tasks.length - 1].completedAt = now;

    // Build per-period records for the sample counters exactly the way the live
    // app does, so the review page has real history on first run.
    tasks.forEach((t) => {
      if (t.kind !== 'counter' || !t.counter) return;
      t.counter.periods = t.counter.periods || {};
      Object.keys(t.counter.history).forEach((key) => {
        if (key === t.counter.periodKey) return;
        TT.Counters.writeRecord(t.counter, key);
      });
    });

    state = Object.assign(base, { tasks });
    persist();
    notify();
  }

  TT.Store = {
    KEY,
    APP_VERSION,
    CATEGORY_COLORS,
    STATUSES,
    KINDS,
    COUNTER_TYPES,
    load,
    get,
    subscribe,
    commit,
    notify,
    persist,
    setSetting,
    buildEnvelope,
    exportJSON,
    validateImport,
    importState,
    hasImportSnapshot,
    undoImport,
    resetAll,
    loadSample,
    defaultSettings
  };
})(typeof window !== 'undefined' ? window : globalThis);
