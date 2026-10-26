/* =========================================================================
   views/list.js — the main task list.
   The toolbar is built once per render; only the body is refreshed while
   typing in the search box, so the caret never jumps.
   ========================================================================= */
(function (global) {
  'use strict';

  const TT = global.TT;
  const U = TT.U;
  const UI = TT.UI;
  const esc = U.escapeHtml;

  let root = null;

  function activeFilters() {
    return TT.App.filters;
  }

  function filterCount(f) {
    let n = 0;
    if (f.search) n++;
    n += f.tagIds.length + f.categoryIds.length;
    if (f.dueFrom || f.dueTo) n++;
    return n;
  }

  function render(container) {
    const f = activeFilters();
    const s = TT.Store.get();
    root = container;

    container.innerHTML =
      '<div class="toolbar">' +
        '<div class="search-wrap">' + UI.icon('search') +
          '<input id="search-input" type="search" class="search-input" placeholder="Search tasks…" ' +
            'value="' + esc(f.search) + '" autocomplete="off" aria-label="Search tasks">' +
        '</div>' +
        '<div class="segmented segmented-sm">' +
          ['active', 'done', 'all'].map((v) =>
            '<button type="button" class="seg' + (f.status === v ? ' is-active' : '') + '" ' +
            'data-action="set-status" data-value="' + v + '">' +
            (v === 'active' ? 'Open' : v === 'done' ? 'Done' : 'All') + '</button>'
          ).join('') +
        '</div>' +
        '<button type="button" class="btn btn-ghost filter-btn" data-action="toggle-filters">' +
          UI.icon('filter') + 'Filters' +
          (filterCount(f) ? '<span class="pill-count">' + filterCount(f) + '</span>' : '') +
        '</button>' +
      '</div>' +
      viewOptsHtml() +
      '<div id="filter-panel" class="filter-panel"' + (TT.App.viewState.filtersOpen ? '' : ' hidden') + '>' +
        filterPanelHtml(f, s) +
      '</div>' +
      '<div id="list-body"></div>';

    renderBody();
    bind();
  }

  /** Group and sort controls. Kept out of the search row so the caret is safe. */
  function viewOptsHtml() {
    const lv = TT.App.listView();
    const groups = [['date', 'Due date'], ['category', 'Category']];
    const sorts = [
      ['due', 'Due date'],
      ['category', 'Category'],
      ['tag', 'Tag'],
      ['created', 'Created (newest)']
    ];

    const select = (id, label, options, current) =>
      '<label class="view-opt" for="' + id + '">' +
        '<span class="view-opt-label">' + label + '</span>' +
        '<select id="' + id + '" class="input input-sm">' +
          options.map((pair) =>
            '<option value="' + pair[0] + '"' + (current === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>'
          ).join('') +
        '</select>' +
      '</label>';

    return '<div class="view-opts">' +
      select('group-by', 'Group by', groups, lv.groupBy) +
      select('sort-by', 'Sort by', sorts, lv.sortBy) +
    '</div>';
  }

  function filterPanelHtml(f, s) {
    const cats = s.categories.map((cat) =>
      '<button type="button" class="chip' + (f.categoryIds.indexOf(cat.id) >= 0 ? ' is-on' : '') + '" ' +
      'data-action="toggle-cat" data-id="' + cat.id + '">' +
      '<i class="dot cat-' + cat.color + '"></i>' + esc(cat.name) + '</button>'
    ).join('');

    const tags = s.tags.map((tag) => {
      const cat = TT.Model.categoryById(tag.categoryId);
      return '<button type="button" class="chip chip-sm' + (f.tagIds.indexOf(tag.id) >= 0 ? ' is-on' : '') + '" ' +
        'data-action="toggle-tag" data-id="' + tag.id + '">' +
        '<i class="dot cat-' + (cat ? cat.color : 'slate') + '"></i>' + esc(tag.name) + '</button>';
    }).join('');

    return '<div class="filter-row">' +
        '<span class="filter-label">Category</span>' +
        '<div class="chip-row">' + cats + '</div>' +
      '</div>' +
      (tags ? '<div class="filter-row">' +
        '<span class="filter-label">Tags</span>' +
        '<div class="chip-row">' + tags + '</div>' +
      '</div>' : '') +
      '<div class="filter-row">' +
        '<span class="filter-label">Due between</span>' +
        '<div class="chip-row">' +
          '<input type="date" class="input input-date" id="filter-from" value="' + esc(f.dueFrom) + '" aria-label="Due from">' +
          '<span class="dash">–</span>' +
          '<input type="date" class="input input-date" id="filter-to" value="' + esc(f.dueTo) + '" aria-label="Due to">' +
          '<button type="button" class="mini-btn" data-action="clear-filters">Clear all</button>' +
        '</div>' +
      '</div>';
  }

  function renderBody() {
    if (!root) return;
    const body = root.querySelector('#list-body');
    if (!body) return;

    const f = activeFilters();
    const today = U.todayKey();
    const lv = TT.App.listView();
    const list = TT.Model.visibleTasks(f, lv.sortBy);
    const counts = TT.Model.counts();

    if (!list.length) {
      const hasFilters = filterCount(f) > 0 || f.status !== 'active';
      body.innerHTML = hasFilters
        ? UI.emptyState({
            icon: 'search',
            title: 'Nothing matches those filters',
            text: 'Try removing a tag or widening the date range.',
            action: 'clear-filters',
            actionLabel: 'Clear filters'
          })
        : UI.emptyState({
            icon: 'check',
            title: counts.active || counts.done ? 'Nothing open — nice work' : 'No tasks yet',
            text: counts.active || counts.done
              ? 'Everything is done or archived. Add the next thing.'
              : 'Add your first task, or set up a counter for something you do every day.',
            action: 'new-task',
            actionLabel: 'Add a task'
          });
      return;
    }

    const groups = lv.groupBy === 'category'
      ? TT.Model.groupTasksByCategory(list)
      : TT.Model.groupTasks(list, today);

    body.innerHTML = groups.map((group) => groupHtml(group, lv.groupBy)).join('');
  }

  function groupHtml(group, groupBy) {
    const key = groupBy + ':' + group.key;
    const collapsed = !!TT.App.viewState.collapsed[key];

    return '<section class="group group-' + group.key + (collapsed ? ' is-collapsed' : '') + '">' +
      '<button type="button" class="group-head" data-action="toggle-group" data-key="' + esc(key) + '" ' +
        'aria-expanded="' + (collapsed ? 'false' : 'true') + '">' +
        '<span class="group-chevron">' + UI.icon('right') + '</span>' +
        (group.color ? '<i class="dot cat-' + group.color + '"></i>' : '') +
        '<span class="group-title">' + esc(group.label) + '</span>' +
        '<span class="group-count">' + group.tasks.length + '</span>' +
      '</button>' +
      '<div class="group-body"' + (collapsed ? ' hidden' : '') + '>' +
        group.tasks.map((t) => (t.kind === 'counter' ? UI.counterCard(t) : UI.taskCard(t))).join('') +
      '</div>' +
    '</section>';
  }

  function bind() {
    const input = root.querySelector('#search-input');
    const from = root.querySelector('#filter-from');
    const to = root.querySelector('#filter-to');
    const groupBy = root.querySelector('#group-by');
    const sortBy = root.querySelector('#sort-by');

    // Both write through settings, which commits and re-renders on its own.
    if (groupBy) {
      groupBy.addEventListener('change', () => TT.App.setListView({ groupBy: groupBy.value }));
    }
    if (sortBy) {
      sortBy.addEventListener('change', () => TT.App.setListView({ sortBy: sortBy.value }));
    }

    if (input) {
      input.addEventListener('input', () => {
        activeFilters().search = input.value;
        renderBody();
        updateFilterBadge();
      });
    }
    if (from) {
      from.addEventListener('change', () => {
        activeFilters().dueFrom = from.value;
        renderBody();
      });
    }
    if (to) {
      to.addEventListener('change', () => {
        activeFilters().dueTo = to.value;
        renderBody();
      });
    }
  }

  function updateFilterBadge() {
    const btn = root && root.querySelector('.filter-btn');
    if (!btn) return;
    const n = filterCount(activeFilters());
    const existing = btn.querySelector('.pill-count');
    if (n && !existing) {
      btn.insertAdjacentHTML('beforeend', '<span class="pill-count">' + n + '</span>');
    } else if (!n && existing) {
      existing.remove();
    } else if (n && existing) {
      existing.textContent = n;
    }
  }

  function onAction(action, el) {
    const f = activeFilters();

    if (action === 'toggle-filters') {
      TT.App.viewState.filtersOpen = !TT.App.viewState.filtersOpen;
      const panel = root.querySelector('#filter-panel');
      if (panel) panel.hidden = !TT.App.viewState.filtersOpen;
      return true;
    }

    if (action === 'set-status') {
      f.status = el.getAttribute('data-value');
      TT.App.render();
      return true;
    }

    if (action === 'toggle-cat') {
      const id = el.getAttribute('data-id');
      const i = f.categoryIds.indexOf(id);
      if (i >= 0) f.categoryIds.splice(i, 1);
      else f.categoryIds.push(id);
      TT.App.render();
      return true;
    }

    if (action === 'toggle-tag') {
      const id = el.getAttribute('data-id');
      const i = f.tagIds.indexOf(id);
      if (i >= 0) f.tagIds.splice(i, 1);
      else f.tagIds.push(id);
      TT.App.render();
      return true;
    }

    if (action === 'toggle-group') {
      const key = el.getAttribute('data-key');
      const collapsed = TT.App.viewState.collapsed;
      if (collapsed[key]) delete collapsed[key];
      else collapsed[key] = true;

      // Toggle in place: a full render would rebuild the list and lose the
      // scroll position for no benefit.
      const section = el.closest('.group');
      if (section) {
        section.classList.toggle('is-collapsed', !!collapsed[key]);
        const body = section.querySelector('.group-body');
        if (body) body.hidden = !!collapsed[key];
        el.setAttribute('aria-expanded', collapsed[key] ? 'false' : 'true');
      }
      return true;
    }

    if (action === 'clear-filters') {
      const next = TT.Model.emptyFilters();
      next.status = f.status === 'done' ? 'done' : 'active';
      Object.assign(f, next);
      TT.App.render();
      return true;
    }

    return false;
  }

  TT.Views = TT.Views || {};
  // Keyed by route name — app.js looks views up as TT.Views[App.route].
  TT.Views.tasks = { render, renderBody, onAction };
})(typeof window !== 'undefined' ? window : globalThis);
