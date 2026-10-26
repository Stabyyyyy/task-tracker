/* =========================================================================
   ui.js — shared widgets: toasts, modals, cards, and the task editor.
   Cards are rendered as HTML strings; all interaction is delegated through
   data-action attributes handled in app.js and the views.
   ========================================================================= */
(function (global) {
  'use strict';

  const TT = global.TT;
  const U = TT.U;
  const esc = U.escapeHtml;

  /* ---------------------------------------------------------------- icons */

  const ICONS = {
    plus: '<path d="M8 3.5v9M3.5 8h9"/>',
    check: '<path d="M3.4 8.4l3 3 6.2-7"/>',
    pencil: '<path d="M11.2 2.9l1.9 1.9-8 8-2.6.7.7-2.6z"/>',
    archive: '<path d="M2.5 6h11v7.5h-11zM2 2.5h12V6H2zM6.3 8.8h3.4"/>',
    trash: '<path d="M2.8 4.4h10.4M6.3 4.4V2.9h3.4v1.5M4.3 4.4l.6 9.2h6.2l.6-9.2"/>',
    restore: '<path d="M3.2 8.2a4.8 4.8 0 1 0 1.5-3.5M3 3v3.4h3.4"/>',
    bell: '<path d="M8 2.3a3.9 3.9 0 0 0-3.9 3.9v3.1L3 11.5h10l-1.1-2.2V6.2A3.9 3.9 0 0 0 8 2.3z"/><path d="M6.4 13.4a1.6 1.6 0 0 0 3.2 0"/>',
    bellOff: '<path d="M8 2.3a3.9 3.9 0 0 0-3.9 3.9v3.1L3 11.5h7.2M6.4 13.4a1.6 1.6 0 0 0 3.2 0M2.5 2.5l11 11"/>',
    left: '<path d="M9.8 3.2L5 8l4.8 4.8"/>',
    right: '<path d="M6.2 3.2L11 8l-4.8 4.8"/>',
    search: '<circle cx="7" cy="7" r="4.1"/><path d="M10.2 10.2L13.8 13.8"/>',
    calendar: '<path d="M2.6 4.6h10.8v8.8H2.6zM2.6 7.6h10.8M5.5 2.6v3M10.5 2.6v3"/>',
    chart: '<path d="M2.6 13.4V9.2M8 13.4V3.4M13.4 13.4V6.6"/>',
    list: '<path d="M3 4.2h10M3 8h10M3 11.8h6.4"/>',
    settings: '<circle cx="8" cy="8" r="2.1"/><path d="M8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"/>',
    x: '<path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6"/>',
    repeat: '<path d="M2.8 6.6A3 3 0 0 1 5.8 3.6h7M11.2 2.1l1.6 1.5-1.6 1.5M13.2 9.4a3 3 0 0 1-3 3h-7M4.8 13.9L3.2 12.4l1.6-1.5"/>',
    download: '<path d="M8 2.6v6.8M5.2 6.8L8 9.6l2.8-2.8M2.6 13.2h10.8"/>',
    upload: '<path d="M8 13.2V6.4M5.2 9.2L8 6.4l2.8 2.8M2.6 3.2h10.8"/>',
    filter: '<path d="M2.6 4.2h10.8M4.6 8h6.8M6.6 11.8h2.8"/>',
    target: '<circle cx="8" cy="8" r="5.2"/><circle cx="8" cy="8" r="1.7"/>',
    tag: '<path d="M2.6 8.4V2.6h5.8l5 5-5 5z"/><circle cx="5.4" cy="5.4" r=".9"/>',
    dots: '<circle cx="3.4" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12.6" cy="8" r="1"/>'
  };

  function icon(name, cls) {
    return '<svg class="icon ' + (cls || '') + '" viewBox="0 0 16 16" fill="none" ' +
      'stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';
  }

  /* --------------------------------------------------------------- toasts */

  const MAX_TOASTS = 3;

  function toast(message, type, ms, action) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    // Keep the stack short — a burst of actions shouldn't curtain the page.
    while (root.children.length >= MAX_TOASTS) {
      root.removeChild(root.firstChild);
    }
    const node = document.createElement('div');
    node.className = 'toast toast-' + (type || 'info');
    node.innerHTML = '<span class="toast-bar"></span><span class="toast-text">' + esc(message) + '</span>' +
      (action ? '<button type="button" class="toast-action">' + esc(action.label) + '</button>' : '');
    if (action) {
      node.querySelector('.toast-action').addEventListener('click', () => {
        node.remove();
        action.onClick();
      });
    }
    root.appendChild(node);
    global.setTimeout(() => {
      if (!node.isConnected) return;
      node.classList.add('is-leaving');
      global.setTimeout(() => node.remove(), 240);
    }, ms || 3400);
  }

  /* --------------------------------------------------------------- modals */

  function modal(opts) {
    const root = document.getElementById('modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML =
      '<div class="modal ' + (opts.size ? 'modal-' + opts.size : '') + '" role="dialog" aria-modal="true">' +
        '<header class="modal-head">' +
          '<h2>' + esc(opts.title || '') + '</h2>' +
          '<button type="button" class="icon-btn" data-close aria-label="Close">' + icon('x') + '</button>' +
        '</header>' +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        '<footer class="modal-foot">' + (opts.footer || '') + '</footer>' +
      '</div>';

    root.appendChild(wrap);
    global.requestAnimationFrame(() => wrap.classList.add('is-open'));

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      wrap.classList.remove('is-open');
      document.removeEventListener('keydown', onKey);
      global.setTimeout(() => wrap.remove(), 190);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === wrap) close();
    });
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) close();
    });

    const firstInput = wrap.querySelector('input, textarea, select');
    if (firstInput && opts.autofocus !== false) {
      global.setTimeout(() => firstInput.focus(), 60);
    }

    return {
      el: wrap,
      body: wrap.querySelector('.modal-body'),
      footer: wrap.querySelector('.modal-foot'),
      close
    };
  }

  function confirmDialog(opts) {
    return new Promise((resolve) => {
      let answered = false;
      const m = modal({
        title: opts.title || 'Are you sure?',
        size: 'sm',
        autofocus: false,
        body: '<p class="confirm-text">' + (opts.message || '') + '</p>' +
          (opts.detail ? '<p class="confirm-detail">' + opts.detail + '</p>' : ''),
        footer: '<span class="spacer"></span>' +
          '<button type="button" class="btn btn-ghost" data-close>' + esc(opts.cancelText || 'Cancel') + '</button>' +
          '<button type="button" class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-confirm>' +
          esc(opts.confirmText || 'Confirm') + '</button>',
        onClose: () => {
          if (!answered) resolve(false);
        }
      });
      m.footer.querySelector('[data-confirm]').addEventListener('click', () => {
        answered = true;
        m.close();
        resolve(true);
      });
    });
  }

  /* ---------------------------------------------------------------- pieces */

  function categoryOf(tag) {
    if (!tag || !tag.categoryId) return null;
    return TT.Model.categoryById(tag.categoryId);
  }

  function tagPill(tag, extraClass) {
    const cat = categoryOf(tag);
    const color = cat ? cat.color : 'slate';
    return '<span class="pill cat-' + color + ' ' + (extraClass || '') + '">' + esc(tag.name) + '</span>';
  }

  function badge(text, kind, iconName) {
    return '<span class="badge badge-' + kind + '">' + (iconName ? icon(iconName) : '') + esc(text) + '</span>';
  }

  function emptyState(opts) {
    return '<div class="empty">' +
      '<div class="empty-mark">' + icon(opts.icon || 'check') + '</div>' +
      '<h3>' + esc(opts.title || 'Nothing here') + '</h3>' +
      (opts.text ? '<p>' + esc(opts.text) + '</p>' : '') +
      (opts.action
        ? '<button type="button" class="btn btn-primary" data-action="' + opts.action + '">' +
          esc(opts.actionLabel || 'Add one') + '</button>'
        : '') +
      '</div>';
  }

  /* ----------------------------------------------------------- task cards */

  function taskCard(task, opts) {
    const o = opts || {};
    const today = U.todayKey();
    const overdue = TT.Model.isOverdue(task, today);
    const done = task.status === 'done';
    const tags = task.tagIds.map((id) => TT.Model.tagById(id)).filter(Boolean);
    const late = task.dueDate && overdue ? Math.abs(U.diffDays(task.dueDate, today)) : 0;

    const meta = [];
    if (task.dueDate) {
      meta.push('<span class="meta-item' + (overdue ? ' is-late' : '') + '">' + icon('calendar') +
        esc(U.formatDate(task.dueDate, 'medium')) +
        (overdue ? ' · ' + late + 'd late' : '') + '</span>');
    }
    if (task.recurrence) {
      meta.push('<span class="meta-item">' + icon('repeat') + esc(U.humanRecurrence(task.recurrence)) + '</span>');
    }
    if (task.notes) {
      meta.push('<span class="meta-item is-quiet">' + icon('list') + esc(task.notes.length > 60 ? task.notes.slice(0, 60) + '…' : task.notes) + '</span>');
    }

    const actions = o.context === 'archive'
      ? '<button type="button" class="icon-btn" data-action="restore-task" data-id="' + task.id + '" aria-label="Restore">' + icon('restore') + '</button>' +
        '<button type="button" class="icon-btn is-danger" data-action="delete-task" data-id="' + task.id + '" aria-label="Delete permanently">' + icon('trash') + '</button>'
      : '<button type="button" class="icon-btn" data-action="edit-task" data-id="' + task.id + '" aria-label="Edit">' + icon('pencil') + '</button>' +
        '<button type="button" class="icon-btn" data-action="archive-task" data-id="' + task.id + '" aria-label="Archive">' + icon('archive') + '</button>';

    const checkEl = o.context === 'archive'
      ? '<span class="check is-static' + (done ? ' is-on' : '') + '" aria-hidden="true">' + icon('check') + '</span>'
      : '<button type="button" class="check' + (done ? ' is-on' : '') + '" data-action="toggle-task" data-id="' + task.id + '" ' +
        'aria-label="' + (done ? 'Mark incomplete' : 'Mark complete') + '">' + icon('check') + '</button>';

    return '<article class="task-card' + (overdue ? ' is-overdue' : '') + (done ? ' is-done' : '') + '" data-task-id="' + task.id + '">' +
      checkEl +
      '<div class="task-main">' +
        '<div class="task-title-row">' +
          '<span class="task-title">' + esc(task.title) + '</span>' +
          (overdue ? badge('Overdue', 'overdue') : '') +
          (task.kind === 'recurring' ? badge('Repeats', 'repeat', 'repeat') : '') +
        '</div>' +
        (meta.length ? '<div class="task-meta">' + meta.join('') + '</div>' : '') +
        (tags.length ? '<div class="task-tags">' + tags.map((t) => tagPill(t)).join('') + '</div>' : '') +
      '</div>' +
      '<div class="task-actions">' + actions + '</div>' +
    '</article>';
  }

  function counterCard(task) {
    const p = TT.Counters.progress(task);
    const c = task.counter;
    const typeLabel = c.type === 'daily' ? 'Resets daily' : c.type === 'cumulative' ? 'Running total' : (c.period === 'month' ? 'Resets monthly' : 'Resets weekly');
    const remindOn = !!task.reminders.counterTime;

    return '<article class="counter-card' + (p.met ? ' is-met' : '') + '" data-task-id="' + task.id + '">' +
      '<header class="counter-head">' +
        '<div class="counter-title-wrap">' +
          '<h3 class="counter-title">' + esc(task.title) + '</h3>' +
          '<div class="counter-sub">' + icon(c.type === 'cumulative' ? 'chart' : 'target') + esc(p.periodLabel) + ' · ' + esc(typeLabel) + '</div>' +
        '</div>' +
        '<button type="button" class="target-btn" data-action="edit-target" data-id="' + task.id + '" ' +
          'title="Change target">' + icon('target') + (p.target == null ? 'Set target' : 'Target ' + p.target) + '</button>' +
      '</header>' +

      '<div class="counter-body">' +
        '<div class="counter-figure">' +
          '<span class="counter-value">' + p.value + '</span>' +
          (p.target != null ? '<span class="counter-target">/ ' + p.target + '</span>' : '') +
          (p.met ? '<span class="badge badge-met">' + icon('check') + (p.exceeded ? 'Exceeded' : 'Goal met') + '</span>' : '') +
        '</div>' +
        (p.target != null
          ? '<div class="progress"><span class="progress-fill" style="width:' + p.pct + '%"></span></div>'
          : '') +
      '</div>' +

      '<footer class="counter-foot">' +
        '<div class="counter-buttons">' +
          '<button type="button" class="round-btn" data-action="counter-dec" data-id="' + task.id + '" aria-label="Decrease by one">−</button>' +
          '<button type="button" class="round-btn is-primary" data-action="counter-inc" data-id="' + task.id + '" aria-label="Increase by one">+</button>' +
        '</div>' +
        '<div class="counter-foot-meta">' +
          (remindOn ? '<span class="meta-item is-quiet">' + icon('bell') + esc(U.formatTime12(task.reminders.counterTime)) + '</span>' : '') +
          '<button type="button" class="icon-btn" data-action="edit-task" data-id="' + task.id + '" aria-label="Edit counter">' + icon('pencil') + '</button>' +
          '<button type="button" class="icon-btn" data-action="archive-task" data-id="' + task.id + '" aria-label="Archive counter">' + icon('archive') + '</button>' +
        '</div>' +
      '</footer>' +
    '</article>';
  }

  /* --------------------------------------------------------- task editor */

  const KIND_LABELS = { plain: 'Task', recurring: 'Repeating', counter: 'Counter' };

  function toDraft(task, defaults) {
    const d = defaults || {};
    if (!task) {
      return {
        title: d.title || '',
        notes: '',
        tagIds: (d.tagIds || []).slice(),
        dueDate: d.dueDate || '',
        kind: 'plain',
        every: 1,
        unit: 'week',
        endType: 'never',
        until: '',
        counterType: 'daily',
        period: 'week',
        target: '',
        onDue: false,
        onRecurrence: false,
        counterTime: '',
        seriesId: null
      };
    }
    const r = task.recurrence || {};
    const c = task.counter || {};
    return {
      title: task.title,
      notes: task.notes || '',
      tagIds: task.tagIds.slice(),
      dueDate: task.dueDate || '',
      kind: task.kind,
      every: r.every || 1,
      unit: r.unit || 'week',
      endType: r.endType || 'never',
      until: r.until || '',
      counterType: c.type || 'daily',
      period: c.period || 'week',
      target: c.target == null ? '' : String(c.target),
      onDue: !!(task.reminders && task.reminders.onDue),
      onRecurrence: !!(task.reminders && task.reminders.onRecurrence),
      counterTime: (task.reminders && task.reminders.counterTime) || '',
      seriesId: (task.recurrence && task.recurrence.seriesId) || null
    };
  }

  function dueField(draft) {
    return '<div class="field">' +
      '<span class="field-label">Due date <span class="opt">optional</span></span>' +
      '<div class="row row-wrap">' +
        '<input type="date" class="input input-date" data-field="dueDate" value="' + esc(draft.dueDate) + '">' +
        '<div class="quick-dates">' +
          '<button type="button" class="mini-btn" data-quick="today">Today</button>' +
          '<button type="button" class="mini-btn" data-quick="tomorrow">Tomorrow</button>' +
          '<button type="button" class="mini-btn" data-quick="nextweek">+1 week</button>' +
          '<button type="button" class="mini-btn" data-quick="clear">Clear</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function forecastText(draft) {
    const anchor = draft.dueDate || U.todayKey();
    try {
      const rule = TT.Recur.normalizeRule({
        every: draft.every,
        unit: draft.unit,
        endType: draft.endType,
        until: draft.until
      }, anchor);
      const dates = TT.Recur.forecast(rule, anchor, 3);
      return dates.length
        ? 'Next: ' + dates.map((d) => U.formatDate(d, 'medium')).join(' · ')
        : 'This repeat has already ended.';
    } catch (err) {
      return '';
    }
  }

  function recurrenceBlock(draft) {
    return '<div class="field">' +
      '<span class="field-label">Repeat</span>' +
      '<div class="row row-wrap">' +
        '<span class="row-label">Every</span>' +
        '<input type="number" min="1" max="365" class="input input-xs" data-field="every" value="' + esc(draft.every) + '">' +
        '<select class="input input-sm" data-field="unit">' +
          '<option value="day"' + (draft.unit === 'day' ? ' selected' : '') + '>day(s)</option>' +
          '<option value="week"' + (draft.unit === 'week' ? ' selected' : '') + '>week(s)</option>' +
          '<option value="month"' + (draft.unit === 'month' ? ' selected' : '') + '>month(s)</option>' +
        '</select>' +
      '</div>' +
      '<div class="row row-wrap">' +
        '<select class="input input-sm" data-field="endType">' +
          '<option value="never"' + (draft.endType === 'never' ? ' selected' : '') + '>Repeat forever</option>' +
          '<option value="until"' + (draft.endType === 'until' ? ' selected' : '') + '>Repeat until</option>' +
        '</select>' +
        (draft.endType === 'until'
          ? '<input type="date" class="input input-date" data-field="until" value="' + esc(draft.until) + '">'
          : '') +
      '</div>' +
      '<p class="hint" id="recur-preview">' + esc(forecastText(draft)) + '</p>' +
    '</div>';
  }

  function counterBlock(draft) {
    const hints = {
      daily: 'Resets to 0 each day. Each day’s final number is kept for the review page.',
      cumulative: 'Never resets. The total is the sum of every change you make.',
      periodic: 'Resets at the start of each ' + (draft.period === 'month' ? 'month' : 'week') + '.'
    };

    return '<div class="field">' +
      '<span class="field-label">Counter style</span>' +
      '<select class="input" data-field="counterType">' +
        '<option value="daily"' + (draft.counterType === 'daily' ? ' selected' : '') + '>Resets every day — “8 glasses of water today”</option>' +
        '<option value="cumulative"' + (draft.counterType === 'cumulative' ? ' selected' : '') + '>Running total — “10 books this year”</option>' +
        '<option value="periodic"' + (draft.counterType === 'periodic' ? ' selected' : '') + '>Periodic target — “guitar 3× this week”</option>' +
      '</select>' +
      (draft.counterType === 'periodic'
        ? '<div class="row row-wrap" style="margin-top:10px">' +
            '<span class="row-label">Resets each</span>' +
            '<select class="input input-sm" data-field="period">' +
              '<option value="week"' + (draft.period === 'week' ? ' selected' : '') + '>week</option>' +
              '<option value="month"' + (draft.period === 'month' ? ' selected' : '') + '>month</option>' +
            '</select>' +
          '</div>'
        : '') +
      '<p class="hint">' + esc(hints[draft.counterType]) + '</p>' +
    '</div>' +
    '<div class="field">' +
      '<span class="field-label">Target <span class="opt">optional</span></span>' +
      '<input type="number" min="0" step="1" class="input input-sm" data-field="target" value="' + esc(draft.target) + '" placeholder="No target">' +
      '<p class="hint">With a target you get a progress bar, a “goal met” badge and an optional nudge.</p>' +
    '</div>';
  }

  function reminderBlock(draft) {
    const settings = TT.Store.get().settings;
    const rows = [];

    if (draft.kind === 'counter') {
      rows.push('<div class="row row-wrap">' +
        '<span class="row-label">Nudge me at</span>' +
        '<input type="time" class="input input-sm" data-field="counterTime" value="' + esc(draft.counterTime) + '">' +
        '<span class="hint-inline">if the target isn’t met</span>' +
      '</div>' +
      '<p class="hint">Leave the time empty to turn the nudge off. A target is required for it to fire.</p>');
    } else if (draft.dueDate) {
      rows.push('<label class="check-row">' +
        '<input type="checkbox" data-field="onDue"' + (draft.onDue ? ' checked' : '') + '>' +
        '<span>Remind me on the due date <span class="hint-inline">at ' + esc(U.formatTime12(settings.defaultReminderTime)) + '</span></span>' +
      '</label>');
      if (draft.kind === 'recurring') {
        rows.push('<label class="check-row">' +
          '<input type="checkbox" data-field="onRecurrence"' + (draft.onRecurrence ? ' checked' : '') + '>' +
          '<span>Remind me when this repeat comes due</span>' +
        '</label>');
      }
    } else {
      // No due date and not a counter: nothing can be reminded yet.
      return '';
    }

    return '<div class="field">' +
      '<span class="field-label">Reminders</span>' +
      '<div class="check-list">' + rows.join('') + '</div>' +
      '<p class="hint">Reminders only fire while this tab is open.</p>' +
    '</div>';
  }

  function tagBlock(draft) {
    const s = TT.Store.get();
    if (!s.tags.length) {
      return '<div class="field"><span class="field-label">Tags</span>' +
        '<p class="hint">No tags yet. <button type="button" class="link-btn" data-go-settings>Create some in Settings</button>.</p></div>';
    }

    const groups = s.categories.map((cat) => {
      const tags = s.tags.filter((t) => t.categoryId === cat.id);
      if (!tags.length) return '';
      return '<div class="tag-group">' +
        '<span class="tag-group-label"><i class="dot cat-' + cat.color + '"></i>' + esc(cat.name) + '</span>' +
        '<div class="tag-chips">' + tags.map((t) =>
          '<button type="button" class="tag-chip' + (draft.tagIds.indexOf(t.id) >= 0 ? ' is-on' : '') + '" ' +
          'data-tag-toggle="' + t.id + '">' + esc(t.name) + '</button>'
        ).join('') + '</div>' +
      '</div>';
    }).join('');

    return '<div class="field">' +
      '<span class="field-label">Tags <span class="opt">optional</span></span>' +
      '<div class="tag-picker">' + groups + '</div>' +
    '</div>';
  }

  function dynamicHtml(draft) {
    const parts = [];

    parts.push('<div class="field">' +
      '<span class="field-label">Type</span>' +
      '<div class="segmented">' +
        ['plain', 'recurring', 'counter'].map((k) =>
          '<button type="button" class="seg' + (draft.kind === k ? ' is-active' : '') + '" data-kind="' + k + '">' +
          KIND_LABELS[k] + '</button>'
        ).join('') +
      '</div>' +
    '</div>');

    if (draft.kind !== 'counter') parts.push(dueField(draft));
    if (draft.kind === 'recurring') parts.push(recurrenceBlock(draft));
    if (draft.kind === 'counter') parts.push(counterBlock(draft));
    parts.push(reminderBlock(draft));
    parts.push(tagBlock(draft));

    return parts.join('');
  }

  function buildPayload(draft) {
    const targetRaw = String(draft.target).trim();
    return {
      title: String(draft.title || '').trim(),
      notes: draft.notes,
      tagIds: draft.tagIds.slice(),
      dueDate: draft.dueDate || null,
      kind: draft.kind,
      recurrence: {
        every: Math.max(1, Number(draft.every) || 1),
        unit: draft.unit,
        endType: draft.endType,
        until: draft.endType === 'until' ? (draft.until || null) : null,
        seriesId: draft.seriesId
      },
      counter: {
        type: draft.counterType,
        period: draft.period,
        target: targetRaw === '' ? null : Number(targetRaw)
      },
      reminders: {
        onDue: draft.onDue,
        onRecurrence: draft.onRecurrence,
        counterTime: draft.counterTime || null
      }
    };
  }

  function openTaskEditor(taskId, defaults) {
    const existing = taskId ? TT.Model.taskById(taskId) : null;
    const draft = toDraft(existing, defaults);

    const m = modal({
      title: existing ? 'Edit task' : 'New task',
      size: 'lg',
      body:
        '<div class="field">' +
          '<label class="field-label" for="tt-title">Title</label>' +
          '<input id="tt-title" type="text" class="input" data-field="title" value="' + esc(draft.title) + '" ' +
            'placeholder="What needs doing?" autocomplete="off">' +
          '<p class="field-error" id="tt-title-error" hidden>Give it a title first.</p>' +
        '</div>' +
        '<div class="field">' +
          '<label class="field-label" for="tt-notes">Notes <span class="opt">optional</span></label>' +
          '<textarea id="tt-notes" class="input" rows="2" data-field="notes" ' +
            'placeholder="Anything worth remembering">' + esc(draft.notes) + '</textarea>' +
        '</div>' +
        '<div id="editor-dynamic"></div>',
      footer:
        (existing ? '<button type="button" class="btn btn-ghost btn-danger-text" data-editor-delete>Delete</button>' : '') +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
        '<button type="button" class="btn btn-primary" data-save>' + (existing ? 'Save changes' : 'Add task') + '</button>'
    });

    const dyn = m.body.querySelector('#editor-dynamic');
    const titleInput = m.body.querySelector('#tt-title');
    const titleError = m.body.querySelector('#tt-title-error');

    function paint() {
      dyn.innerHTML = dynamicHtml(draft);
    }
    paint();

    function updatePreview() {
      const el = dyn.querySelector('#recur-preview');
      if (el) el.textContent = forecastText(draft);
    }

    m.body.addEventListener('input', (e) => {
      const field = e.target.getAttribute('data-field');
      if (!field) return;
      if (e.target.type === 'checkbox') draft[field] = e.target.checked;
      else draft[field] = e.target.value;
      if (field === 'title' && titleError) titleError.hidden = true;
      // Update the "Next: …" line live while typing, without rebuilding the
      // form (which would steal focus from the number input).
      if (field === 'every' || field === 'unit') updatePreview();
    });

    m.body.addEventListener('change', (e) => {
      const field = e.target.getAttribute('data-field');
      if (!field) return;
      if (e.target.type === 'checkbox') draft[field] = e.target.checked;
      else draft[field] = e.target.value;
      if (field === 'dueDate' || field === 'counterType' || field === 'endType' || field === 'period') {
        paint();
      } else if (field === 'unit' || field === 'every') {
        // A select change doesn't fire 'input', so refresh the preview here.
        updatePreview();
      }
    });

    m.body.addEventListener('click', (e) => {
      const kindBtn = e.target.closest('[data-kind]');
      if (kindBtn) {
        draft.kind = kindBtn.getAttribute('data-kind');
        if (draft.kind === 'recurring' && !draft.dueDate) draft.dueDate = U.todayKey();
        paint();
        return;
      }

      const tagBtn = e.target.closest('[data-tag-toggle]');
      if (tagBtn) {
        const id = tagBtn.getAttribute('data-tag-toggle');
        const i = draft.tagIds.indexOf(id);
        if (i >= 0) draft.tagIds.splice(i, 1);
        else draft.tagIds.push(id);
        tagBtn.classList.toggle('is-on', i < 0);
        return;
      }

      const quick = e.target.closest('[data-quick]');
      if (quick) {
        const kind = quick.getAttribute('data-quick');
        if (kind === 'today') draft.dueDate = U.todayKey();
        else if (kind === 'tomorrow') draft.dueDate = U.addDays(U.todayKey(), 1);
        else if (kind === 'nextweek') draft.dueDate = U.addDays(U.todayKey(), 7);
        else draft.dueDate = '';
        paint();
        return;
      }

      if (e.target.closest('[data-go-settings]')) {
        m.close();
        TT.App.navigate('settings');
      }
    });

    function save() {
      const title = String(draft.title || '').trim();
      if (!title) {
        titleError.hidden = false;
        titleInput.focus();
        return;
      }
      if (draft.kind === 'recurring' && draft.endType === 'until' && !draft.until) {
        toast('Pick the date this repeat should stop.', 'error');
        return;
      }
      const payload = buildPayload(draft);
      if (existing) TT.Model.updateTask(existing.id, payload);
      else TT.Model.createTask(payload);
      m.close();
      toast(existing ? 'Task updated' : 'Task added', 'success');
    }

    m.footer.querySelector('[data-save]').addEventListener('click', save);

    const delBtn = m.footer.querySelector('[data-editor-delete]');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        confirmDialog({
          title: 'Delete this task?',
          message: '“' + esc(existing.title) + '” will be removed permanently.',
          detail: 'Archiving keeps it recoverable instead.',
          confirmText: 'Delete',
          danger: true
        }).then((yes) => {
          if (!yes) return;
          TT.Model.deleteTask(existing.id);
          m.close();
          toast('Task deleted', 'success');
        });
      });
    }

    return m;
  }

  function openTargetEditor(task) {
    const current = task.counter.target;
    const m = modal({
      title: 'Target for “' + task.title + '”',
      size: 'sm',
      body: '<div class="field">' +
        '<label class="field-label" for="tt-target">Target value</label>' +
        '<input id="tt-target" type="number" min="0" step="1" class="input" value="' +
          (current == null ? '' : current) + '" placeholder="No target">' +
        '<p class="hint">Leave empty to remove the target, the progress bar and the reminder.</p>' +
      '</div>',
      footer: '<span class="spacer"></span>' +
        '<button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
        '<button type="button" class="btn btn-primary" data-save>Save</button>'
    });

    const input = m.body.querySelector('#tt-target');
    function commit() {
      TT.Counters.setTarget(task.id, input.value.trim() === '' ? null : Number(input.value));
      m.close();
      toast('Target updated', 'success');
    }
    m.footer.querySelector('[data-save]').addEventListener('click', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
    });
  }

  TT.UI = {
    icon,
    toast,
    modal,
    confirmDialog,
    tagPill,
    badge,
    emptyState,
    taskCard,
    counterCard,
    openTaskEditor,
    openTargetEditor,
    KIND_LABELS
  };
})(typeof window !== 'undefined' ? window : globalThis);
