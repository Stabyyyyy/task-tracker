/* =========================================================================
   views/stats.js — review page: completion numbers and counter history.
   ========================================================================= */
(function (global) {
  'use strict';

  const TT = global.TT;
  const U = TT.U;
  const UI = TT.UI;
  const esc = U.escapeHtml;

  let granularity = 'week';
  let anchor = null;

  function ensureState() {
    if (!anchor) anchor = U.todayKey();
  }

  function percent(n, d) {
    if (!d) return '—';
    return Math.round((n / d) * 100) + '%';
  }

  function metricCard(label, value, sub, tone) {
    return '<div class="stat-card' + (tone ? ' tone-' + tone : '') + '">' +
      '<span class="stat-label">' + esc(label) + '</span>' +
      '<span class="stat-value">' + esc(value) + '</span>' +
      (sub ? '<span class="stat-sub">' + esc(sub) + '</span>' : '') +
    '</div>';
  }

  function render(container) {
    ensureState();
    const r = TT.Stats.range(granularity, anchor);
    const filter = TT.App.filters;
    const summary = TT.Stats.summary(r, filter);
    const breakdown = TT.Stats.tagBreakdown(r, filter);
    const counters = TT.Stats.counterSeries(r, filter);
    const s = TT.Store.get();

    const tagChips = s.tags.map((tag) => {
      const cat = TT.Model.categoryById(tag.categoryId);
      const on = filter.tagIds.indexOf(tag.id) >= 0;
      return '<button type="button" class="chip chip-sm' + (on ? ' is-on' : '') + '" ' +
        'data-action="toggle-tag" data-id="' + tag.id + '">' +
        '<i class="dot cat-' + (cat ? cat.color : 'slate') + '"></i>' + esc(tag.name) + '</button>';
    }).join('');

    const maxCompleted = breakdown.reduce((m, row) => Math.max(m, row.completed), 0);

    container.innerHTML =
      '<div class="stats-head">' +
        '<div class="segmented">' +
          [['week', 'Week'], ['month', 'Month'], ['year', 'Year']].map((pair) =>
            '<button type="button" class="seg' + (granularity === pair[0] ? ' is-active' : '') + '" ' +
            'data-action="set-granularity" data-value="' + pair[0] + '">' + pair[1] + '</button>'
          ).join('') +
        '</div>' +
        '<div class="cal-nav">' +
          '<button type="button" class="icon-btn" data-action="stats-prev" aria-label="Previous period">' + UI.icon('left') + '</button>' +
          '<span class="period-label">' + esc(r.label) + '</span>' +
          '<button type="button" class="icon-btn" data-action="stats-next" aria-label="Next period">' + UI.icon('right') + '</button>' +
          '<button type="button" class="mini-btn" data-action="stats-today">This ' + granularity + '</button>' +
        '</div>' +
      '</div>' +

      (tagChips ? '<div class="chip-row stats-filter">' + tagChips + '</div>' : '') +

      '<div class="stat-grid">' +
        metricCard('Completed', String(summary.completed), summary.created + ' created · ' + summary.due + ' due') +
        metricCard('Completion rate (due)', summary.rate.due == null ? '—' : summary.rate.due + '%',
          summary.dueBased.n + ' of ' + summary.dueBased.d + ' due tasks finished', 'good') +
        metricCard('Completion rate (created)', summary.rate.created == null ? '—' : summary.rate.created + '%',
          summary.createdBased.n + ' of ' + summary.createdBased.d + ' created tasks finished') +
        metricCard('Still open', String(summary.slipped), 'due in this period, not done',
          summary.slipped ? 'warn' : '') +
      '</div>' +

      '<section class="panel">' +
        '<div class="panel-head">' +
          '<h2>Breakdown by tag</h2>' +
          '<span class="hint">' + esc(r.label) + '</span>' +
        '</div>' +
        (breakdown.length
          ? '<table class="data-table">' +
              '<thead><tr><th>Tag</th><th class="num">Done</th><th class="num">Due</th><th class="num">Open</th><th class="bar-col"></th></tr></thead>' +
              '<tbody>' + breakdown.map((row) => {
                const cat = row.category;
                const color = cat ? cat.color : 'slate';
                const width = maxCompleted ? Math.round((row.completed / maxCompleted) * 100) : 0;
                return '<tr>' +
                  '<td><span class="table-tag"><i class="dot cat-' + color + '"></i>' + esc(row.tag.name) +
                    (cat ? '<span class="table-cat">' + esc(cat.name) + '</span>' : '') + '</span></td>' +
                  '<td class="num">' + row.completed + '</td>' +
                  '<td class="num">' + row.due + '</td>' +
                  '<td class="num">' + row.open + '</td>' +
                  '<td class="bar-col"><span class="mini-bar"><span class="mini-bar-fill cat-bg-' + color + '" style="width:' + width + '%"></span></span></td>' +
                '</tr>';
              }).join('') + '</tbody>' +
            '</table>'
          : '<p class="hint">No tagged tasks in this period.</p>') +
      '</section>' +

      '<section class="panel">' +
        '<div class="panel-head">' +
          '<h2>Counters</h2>' +
          '<span class="hint">' + esc(r.label) + '</span>' +
        '</div>' +
        (counters.length
          ? '<div class="counter-history">' + counters.map(counterBlock).join('') + '</div>'
          : '<p class="hint">No counters yet. Create one with the “Counter” task type.</p>') +
      '</section>';
  }

  function counterBlock(entry) {
    const task = entry.task;
    const head = '<div class="ch-head">' +
      '<div>' +
        '<h3>' + esc(task.title) + '</h3>' +
        '<p class="hint">' + esc(counterTypeLabel(entry)) + (entry.target != null ? ' · target ' + entry.target : ' · no target') + '</p>' +
      '</div>' +
      (entry.type === 'cumulative'
        ? '<div class="ch-total"><span class="ch-total-value">' + entry.total + '</span><span class="hint">all time · ' +
          (entry.delta >= 0 ? '+' : '') + entry.delta + ' this period</span></div>'
        : (entry.rate != null
            ? '<div class="ch-total"><span class="ch-total-value">' + entry.met + '/' + entry.known + '</span><span class="hint">periods on target</span></div>'
            : '')) +
    '</div>';

    if (entry.type === 'cumulative') {
      return '<div class="ch-block">' + head + '</div>';
    }

    const cells = entry.cells;
    const compact = cells.length > 20;

    const body = compact
      ? '<div class="heat-strip">' + cells.map((c) =>
          '<span class="heat heat-' + c.state + '" title="' + esc(cellTitle(c, entry)) + '"></span>'
        ).join('') + '</div>'
      : '<div class="cell-grid">' + cells.map((c) =>
          '<span class="cell cell-' + c.state + '" title="' + esc(cellTitle(c, entry)) + '">' +
            '<span class="cell-label">' + esc(c.label) + '</span>' +
            '<span class="cell-value">' + (c.value == null || c.future ? '—' : c.value) +
              (!c.future && c.target != null ? '<span class="cell-target">/' + c.target + '</span>' : '') +
            '</span>' +
          '</span>'
        ).join('') + '</div>';

    return '<div class="ch-block">' + head + body + '</div>';
  }

  function cellTitle(cell, entry) {
    const label = entry.unit === 'day'
      ? U.formatDate(cell.key, 'long')
      : entry.unit === 'week'
        ? 'Week ' + cell.key.slice(5) + ' (' + U.formatDate(U.weekKeyToMonday(cell.key), 'short') + ')'
        : U.MONTHS[Number(cell.key.slice(5, 7)) - 1] + ' ' + cell.key.slice(0, 4);
    if (cell.value == null) return label + ' — no record';
    return label + ' — ' + cell.value + (cell.target != null ? '/' + cell.target : '');
  }

  function counterTypeLabel(entry) {
    if (entry.type === 'cumulative') return 'Running total';
    if (entry.type === 'daily') return 'Daily counter';
    return entry.unit === 'month' ? 'Monthly target' : 'Weekly target';
  }

  function onAction(action, el) {
    if (action === 'set-granularity') {
      granularity = el.getAttribute('data-value');
      TT.App.render();
      return true;
    }
    if (action === 'stats-prev' || action === 'stats-next') {
      anchor = TT.Stats.shift(granularity, anchor, action === 'stats-prev' ? -1 : 1);
      TT.App.render();
      return true;
    }
    if (action === 'stats-today') {
      anchor = U.todayKey();
      TT.App.render();
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
  TT.Views.stats = { render, onAction };
})(typeof window !== 'undefined' ? window : globalThis);
