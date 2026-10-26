/* =========================================================================
   app.js — bootstrap, hash router, render loop, and the shared action
   handlers that every view can rely on.
   ========================================================================= */
(function (global) {
  'use strict';

  const TT = global.TT;
  const U = TT.U;
  const UI = TT.UI;
  const esc = U.escapeHtml;

  const ROUTES = ['tasks', 'calendar', 'stats', 'archive', 'settings'];

  const App = (TT.App = {
    filters: TT.Model.emptyFilters(),
    viewState: { filtersOpen: false },
    route: 'tasks'
  });

  /* ---------------------------------------------------------------- router */

  function parseHash() {
    const raw = String(global.location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return ROUTES.indexOf(raw) >= 0 ? raw : 'tasks';
  }

  function navigate(route) {
    const next = ROUTES.indexOf(route) >= 0 ? route : 'tasks';
    // Set the route immediately: a commit fired before hashchange would
    // otherwise re-render the previous view.
    App.route = next;
    if (parseHash() === next) {
      render();
    } else {
      global.location.hash = '#/' + next;
    }
  }

  /* ---------------------------------------------------------------- theme */

  const darkQuery = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;

  function applyTheme() {
    const choice = (TT.Store.get().settings.theme) || 'system';
    const resolved = choice === 'system'
      ? (darkQuery && darkQuery.matches ? 'dark' : 'light')
      : choice;
    document.documentElement.setAttribute('data-theme', resolved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#14171c' : '#f6f7f9');
  }

  /* --------------------------------------------------------------- render */

  function render() {
    const view = document.getElementById('view');
    if (!view) return;

    // Keep focus and caret position across the re-render (the search box in
    // particular, which is rebuilt along with the toolbar).
    const active = document.activeElement;
    let focusId = null;
    let selStart = null;
    let selEnd = null;
    if (active && active.id && view.contains(active)) {
      focusId = active.id;
      try {
        selStart = active.selectionStart;
        selEnd = active.selectionEnd;
      } catch (err) {
        /* not a text field */
      }
    }

    const mod = TT.Views[App.route] || TT.Views.tasks;
    mod.render(view);
    if (mod.bind) mod.bind(view);

    document.querySelectorAll('[data-route]').forEach((a) => {
      const isActive = a.getAttribute('data-route') === App.route;
      a.classList.toggle('is-active', isActive);
      if (isActive) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    updateSubtitle();
    applyTheme();

    if (focusId) {
      const next = document.getElementById(focusId);
      if (next) {
        next.focus();
        if (selStart != null && typeof next.setSelectionRange === 'function') {
          try {
            next.setSelectionRange(selStart, selEnd);
          } catch (err) {
            /* ignore */
          }
        }
      }
    }
  }

  function updateSubtitle() {
    const el = document.getElementById('header-sub');
    if (!el) return;
    const c = TT.Model.counts();
    const bits = [c.active + ' open'];
    if (c.overdue) bits.push(c.overdue + ' overdue');
    if (c.today) bits.push(c.today + ' due today');
    el.textContent = bits.join(' · ');
  }

  /* -------------------------------------------------------------- actions */

  function handleGlobal(action, el) {
    const id = el.getAttribute('data-id');

    if (action === 'new-task') {
      UI.openTaskEditor(null);
      return true;
    }

    if (action === 'edit-task') {
      if (TT.Model.taskById(id)) UI.openTaskEditor(id);
      return true;
    }

    if (action === 'toggle-task') {
      const result = TT.Model.toggleComplete(id);
      if (result.childKept) {
        UI.toast('Next occurrence was already edited, so it was left in place.', 'info', 5200);
      } else if (result.spawnedId) {
        UI.toast('Done — next one scheduled', 'success', 4200, {
          label: 'Undo',
          onClick: () => TT.Model.toggleComplete(id)
        });
      } else if (result.completed) {
        // Completed tasks leave the "Open" list, so offer a one-click undo.
        UI.toast('Task completed', 'success', 4200, {
          label: 'Undo',
          onClick: () => TT.Model.toggleComplete(id)
        });
      } else if (result.removedChild) {
        UI.toast('Reopened — the generated repeat was removed', 'info');
      }
      return true;
    }

    if (action === 'archive-task') {
      TT.Model.archiveTask(id);
      UI.toast('Archived', 'success');
      return true;
    }

    if (action === 'restore-task') {
      TT.Model.restoreTask(id);
      UI.toast('Restored', 'success');
      return true;
    }

    if (action === 'delete-task') {
      const task = TT.Model.taskById(id);
      if (!task) return true;
      UI.confirmDialog({
        title: 'Delete permanently?',
        message: '“' + esc(task.title) + '” will be gone for good.',
        detail: 'Archive it instead if you might want it back.',
        confirmText: 'Delete',
        danger: true
      }).then((ok) => {
        if (!ok) return;
        TT.Model.deleteTask(id);
        UI.toast('Deleted', 'success');
      });
      return true;
    }

    if (action === 'counter-inc') {
      TT.Counters.increment(id, 1);
      return true;
    }

    if (action === 'counter-dec') {
      TT.Counters.increment(id, -1);
      return true;
    }

    if (action === 'edit-target') {
      const task = TT.Model.taskById(id);
      if (task && task.counter) UI.openTargetEditor(task);
      return true;
    }

    return false;
  }

  function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.getAttribute('data-action');

    if (handleGlobal(action, el)) return;

    const mod = TT.Views[App.route];
    if (mod && mod.onAction && mod.onAction(action, el, e)) return;
  }

  function onKeyDown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const cell = e.target.closest('[data-action="cal-select"]');
    if (!cell) return;
    e.preventDefault();
    cell.click();
  }

  /* ----------------------------------------------------------------- boot */

  function boot() {
    TT.Store.load();
    applyTheme();
    TT.Counters.reconcileAll();

    TT.Store.subscribe(() => render());

    App.route = parseHash();
    render();

    global.addEventListener('hashchange', () => {
      App.route = parseHash();
      render();
    });

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);

    if (darkQuery) {
      const onScheme = () => {
        if (TT.Store.get().settings.theme === 'system') applyTheme();
      };
      if (typeof darkQuery.addEventListener === 'function') darkQuery.addEventListener('change', onScheme);
      else if (typeof darkQuery.addListener === 'function') darkQuery.addListener(onScheme);
    }

    TT.Reminders.init();

    // Flush any pending state when the tab goes away.
    global.addEventListener('pagehide', () => TT.Store.persist());
  }

  App.render = render;
  App.navigate = navigate;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
