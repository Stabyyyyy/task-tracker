/* =========================================================================
   views/calendar.js — month grid of tasks by due date.
   ========================================================================= */
(function (global) {
  'use strict';

  const TT = global.TT;
  const U = TT.U;
  const UI = TT.UI;
  const esc = U.escapeHtml;

  let monthAnchor = null;
  let selectedDay = null;
  let root = null;

  function ensureState() {
    if (!monthAnchor) monthAnchor = U.monthKey(U.todayKey());
    if (!selectedDay) selectedDay = U.todayKey();
  }

  function calendarTasks() {
    const f = TT.App.filters;
    const filter = {
      search: '',
      tagIds: f.tagIds,
      categoryIds: f.categoryIds,
      dueFrom: '',
      dueTo: '',
      status: 'all'
    };
    return TT.Model.visibleTasks(filter).filter((t) => t.dueDate && t.kind !== 'counter');
  }

  function pillColor(task) {
    const first = task.tagIds.map((id) => TT.Model.tagById(id)).filter(Boolean)[0];
    if (!first) return 'slate';
    const cat = TT.Model.categoryById(first.categoryId);
    return cat ? cat.color : 'slate';
  }

  function render(container) {
    ensureState();
    root = container;

    const s = TT.Store.get();
    const today = U.todayKey();
    const tasks = calendarTasks();

    const byDay = {};
    tasks.forEach((t) => {
      (byDay[t.dueDate] = byDay[t.dueDate] || []).push(t);
    });

    const first = monthAnchor + '-01';
    const gridStart = U.startOfWeek(first, 1);
    const monthIndex = Number(monthAnchor.slice(5, 7)) - 1;
    const year = Number(monthAnchor.slice(0, 4));

    // Render only the weeks this month needs (4–6 rows, not always 6).
    const leading = U.diffDays(first, gridStart);
    const weekCount = Math.ceil((leading + U.daysInMonth(year, monthIndex)) / 7);
    const cells = [];
    for (let i = 0; i < weekCount * 7; i++) cells.push(U.addDays(gridStart, i));

    const monthLabel = U.MONTHS[monthIndex] + ' ' + year;

    const tagChips = s.tags.map((tag) => {
      const cat = TT.Model.categoryById(tag.categoryId);
      const on = TT.App.filters.tagIds.indexOf(tag.id) >= 0;
      return '<button type="button" class="chip chip-sm' + (on ? ' is-on' : '') + '" ' +
        'data-action="toggle-tag" data-id="' + tag.id + '">' +
        '<i class="dot cat-' + (cat ? cat.color : 'slate') + '"></i>' + esc(tag.name) + '</button>';
    }).join('');

    container.innerHTML =
      '<div class="cal-head">' +
        '<div class="cal-nav">' +
          '<button type="button" class="icon-btn" data-action="cal-prev" aria-label="Previous month">' + UI.icon('left') + '</button>' +
          '<h2 class="cal-title">' + esc(monthLabel) + '</h2>' +
          '<button type="button" class="icon-btn" data-action="cal-next" aria-label="Next month">' + UI.icon('right') + '</button>' +
          '<button type="button" class="mini-btn" data-action="cal-today">Today</button>' +
        '</div>' +
        (tagChips ? '<div class="chip-row cal-filter">' + tagChips + '</div>' : '') +
      '</div>' +

      '<div class="cal-grid">' +
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => '<div class="cal-dow">' + d + '</div>').join('') +
        cells.map((key) => {
          const dayTasks = byDay[key] || [];
          const isOut = U.monthKey(key) !== monthAnchor;
          const isToday = key === today;
          const isSelected = key === selectedDay;
          const hasOverdue = dayTasks.some((t) => TT.Model.isOverdue(t, today));
          const shown = dayTasks.slice(0, 3);

          return '<div class="cal-cell' + (isOut ? ' is-out' : '') + (isToday ? ' is-today' : '') +
              (isSelected ? ' is-selected' : '') + (hasOverdue ? ' has-overdue' : '') + '" ' +
              'data-action="cal-select" data-date="' + key + '" role="button" tabindex="0">' +
            '<span class="cal-daynum">' + Number(key.slice(8, 10)) + '</span>' +
            '<span class="cal-pills">' +
              shown.map((t) =>
                '<span class="cal-pill cat-' + pillColor(t) +
                (t.completedAt ? ' is-done' : '') +
                (TT.Model.isOverdue(t, today) ? ' is-overdue' : '') + '">' +
                esc(t.title) + '</span>'
              ).join('') +
              (dayTasks.length > 3 ? '<span class="cal-more">+' + (dayTasks.length - 3) + ' more</span>' : '') +
            '</span>' +
          '</div>';
        }).join('') +
      '</div>' +

      '<div class="day-panel" id="day-panel">' + dayPanelHtml(byDay, today) + '</div>';
  }

  function dayPanelHtml(byDay, today) {
    if (!selectedDay) {
      return '<p class="hint">Pick a day to see what’s on it.</p>';
    }
    const list = (byDay || {})[selectedDay] || [];
    const isToday = selectedDay === today;

    return '<div class="day-head">' +
        '<div>' +
          '<h3>' + esc(U.formatDate(selectedDay, 'long')) + (isToday ? ' <span class="badge badge-today">Today</span>' : '') + '</h3>' +
          '<p class="hint">' + (list.length ? list.length + ' ' + U.plural(list.length, 'task') : 'Nothing scheduled') + '</p>' +
        '</div>' +
        '<button type="button" class="btn btn-ghost" data-action="new-task-date" data-date="' + selectedDay + '">' +
          UI.icon('plus') + 'Add task' +
        '</button>' +
      '</div>' +
      (list.length
        ? '<div class="day-list">' + list.map((t) => UI.taskCard(t)).join('') + '</div>'
        : '<div class="day-empty">' + UI.icon('calendar') + '<span>Free day.</span></div>');
  }

  function onAction(action, el) {
    if (action === 'cal-prev' || action === 'cal-next') {
      const dir = action === 'cal-prev' ? -1 : 1;
      monthAnchor = U.monthKey(U.addMonthsClamped(monthAnchor + '-01', dir, 1));
      TT.App.render();
      return true;
    }

    if (action === 'cal-today') {
      monthAnchor = U.monthKey(U.todayKey());
      selectedDay = U.todayKey();
      TT.App.render();
      return true;
    }

    if (action === 'cal-select') {
      selectedDay = el.getAttribute('data-date');
      if (U.monthKey(selectedDay) !== monthAnchor) monthAnchor = U.monthKey(selectedDay);
      TT.App.render();
      return true;
    }

    if (action === 'new-task-date') {
      UI.openTaskEditor(null, { dueDate: el.getAttribute('data-date') });
      return true;
    }

    if (action === 'toggle-tag') {
      const id = el.getAttribute('data-id');
      const ids = TT.App.filters.tagIds;
      const i = ids.indexOf(id);
      if (i >= 0) ids.splice(i, 1);
      else ids.push(id);
      TT.App.render();
      return true;
    }

    return false;
  }

  TT.Views = TT.Views || {};
  TT.Views.calendar = { render, onAction };
})(typeof window !== 'undefined' ? window : globalThis);
