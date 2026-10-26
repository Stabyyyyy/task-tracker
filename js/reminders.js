/* =========================================================================
   reminders.js — in-tab notification scheduler.

   Runs on a 30 second timer plus a tick whenever the tab becomes visible.
   Nothing runs while the tab is closed: that is the documented trade-off of
   using the Notification API without a service worker.
   ========================================================================= */
(function (global) {
  'use strict';

  const TT = global.TT;
  const U = TT.U;

  const TICK_MS = 30000;
  const RETENTION_MS = 7 * 86400000;

  let timer = null;
  let started = false;

  function supported() {
    return typeof global.Notification !== 'undefined';
  }

  function permission() {
    if (!supported()) return 'unsupported';
    return global.Notification.permission;
  }

  function requestPermission() {
    if (!supported()) return Promise.resolve('unsupported');
    if (global.Notification.permission === 'granted') {
      TT.Store.commit((s) => {
        s.settings.notificationsEnabled = true;
      });
      return Promise.resolve('granted');
    }
    let request;
    try {
      request = global.Notification.requestPermission();
    } catch (err) {
      // Some browsers throw outright on insecure origins (file://).
      return Promise.resolve('unsupported');
    }
    return Promise.resolve(request).then((result) => {
      TT.Store.commit((s) => {
        s.settings.notificationsEnabled = result === 'granted';
      });
      return result;
    });
  }

  /* --------------------------------------------------------------- dedupe */

  function keyFor(taskId, kind, suffix) {
    return taskId + ':' + kind + ':' + suffix;
  }

  function wasSent(key) {
    return !!TT.Store.get().settings.notified[key];
  }

  function markSent(key) {
    TT.Store.commit((s) => {
      s.settings.notified[key] = Date.now();
    });
  }

  /** Called when a counter hits its target — the nudge for that period is moot. */
  function markSatisfied(taskId) {
    const task = TT.Model.taskById(taskId);
    if (!task || !task.counter || !task.counter.periodKey) return;
    const key = keyFor(taskId, 'ctr', task.counter.periodKey);
    if (!wasSent(key)) markSent(key);
  }

  function prune() {
    const s = TT.Store.get();
    const cutoff = Date.now() - RETENTION_MS;
    let changed = false;
    Object.keys(s.settings.notified).forEach((k) => {
      if (!(s.settings.notified[k] >= cutoff)) {
        delete s.settings.notified[k];
        changed = true;
      }
    });
    if (changed) TT.Store.persist();
  }

  /* ----------------------------------------------------------- candidates */

  function candidates(now) {
    const s = TT.Store.get();
    const today = U.dateKey(now);
    const mins = U.minutesNow(now);
    const defaultTime = U.timeToMinutes(s.settings.defaultReminderTime || '09:00');
    const out = [];

    s.tasks.forEach((task) => {
      if (task.status !== 'active') return;

      if (task.kind === 'counter') {
        const c = task.counter;
        if (!c || !task.reminders.counterTime || c.target == null) return;
        if (mins < U.timeToMinutes(task.reminders.counterTime)) return;

        const p = TT.Counters.progress(task, now);
        if (p.value >= c.target) return;

        const key = keyFor(task.id, 'ctr', c.periodKey || today);
        if (wasSent(key)) return;

        out.push({
          key,
          taskId: task.id,
          kind: 'counter',
          title: task.title + ' — ' + p.value + '/' + p.target,
          body: p.remaining + ' to go ' + p.unitLabel + '. Still time.'
        });
        return;
      }

      if (!task.dueDate || task.dueDate !== today) return;

      if (task.kind === 'recurring' && task.reminders.onRecurrence) {
        const key = keyFor(task.id, 'recur', today);
        if (mins >= defaultTime && !wasSent(key)) {
          out.push({
            key,
            taskId: task.id,
            kind: 'recurring',
            title: 'Repeating task due today',
            body: task.title
          });
        }
        return;
      }

      if (task.reminders.onDue) {
        const key = keyFor(task.id, 'due', today);
        if (mins >= defaultTime && !wasSent(key)) {
          out.push({
            key,
            taskId: task.id,
            kind: 'due',
            title: 'Due today',
            body: task.title
          });
        }
      }
    });

    return out;
  }

  /* ------------------------------------------------------------- delivery */

  function fire(item) {
    markSent(item.key);

    if (permission() === 'granted') {
      try {
        const note = new global.Notification(item.title, {
          body: item.body,
          tag: item.key,
          renotify: false
        });
        note.onclick = function () {
          global.focus();
          note.close();
        };
        return 'notification';
      } catch (err) {
        // Chrome refuses the constructor on insecure origins (file://).
        console.warn('Notification failed, falling back to toast', err);
      }
    }

    if (TT.UI) {
      TT.UI.toast(item.title + (item.body ? ' — ' + item.body : ''), 'reminder', 8000);
    }
    return 'toast';
  }

  function tick(now) {
    const date = now || new Date();
    TT.Counters.reconcileAll(date);
    const items = candidates(date);
    items.forEach(fire);
    return items.length;
  }

  function init() {
    if (started) return;
    started = true;
    prune();
    tick();
    timer = global.setInterval(() => tick(), TICK_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tick();
    });
    global.addEventListener('focus', () => tick());
  }

  function stop() {
    if (timer) global.clearInterval(timer);
    timer = null;
    started = false;
  }

  function test() {
    const item = {
      key: 'test:' + Date.now(),
      title: 'Reminders are working',
      body: 'This is what a due-date nudge looks like.'
    };
    return fire(item);
  }

  TT.Reminders = {
    supported,
    permission,
    requestPermission,
    markSatisfied,
    candidates,
    tick,
    init,
    stop,
    test,
    prune
  };
})(typeof window !== 'undefined' ? window : globalThis);
