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
  // null means "follow the selected period": Week -> day, Month -> week,
  // Year -> month. Once the user clicks an axis button it becomes explicit.
  let chartAxis = null;
  let chartMetric = 'completed';

  function ensureState() {
    if (!anchor) anchor = U.todayKey();
  }

  function activeAxis() {
    return chartAxis || TT.Stats.defaultAxis(granularity);
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

  /* ------------------------------------------------------------ trend chart */

  const CHART_W = 720;
  const CHART_H = 220;
  const PAD = { l: 42, r: 22, t: 14, b: 32 };

  /**
   * These metrics are whole numbers, so keep the ceiling even: the half-height
   * grid line then always has an integer label instead of two rounded "1"s.
   */
  function niceMax(n) {
    if (!n || n <= 2) return 2;
    let m;
    if (n <= 4) m = n;
    else {
      const step = Math.pow(10, Math.floor(Math.log10(n)));
      m = Math.ceil(n / step) * step;
    }
    return m % 2 === 0 ? m : m + 1;
  }

  /** Display-only SVG. Colours come from CSS variables so both themes work. */
  function trendSvg(series) {
    if (!series.length) return '';
    const w = CHART_W;
    const h = CHART_H;
    const innerW = w - PAD.l - PAD.r;
    const innerH = h - PAD.t - PAD.b;
    const base = PAD.t + innerH;
    const max = niceMax(series.reduce((m, d) => Math.max(m, d.value), 0));
    const n = series.length;
    const step = n > 1 ? innerW / (n - 1) : 0;
    const xOf = (i) => PAD.l + (n > 1 ? i * step : innerW / 2);
    const yOf = (v) => base - (v / max) * innerH;

    const grid = [0, 0.5, 1].map((f) => {
      const y = base - f * innerH;
      return '<line class="trend-grid" x1="' + PAD.l + '" y1="' + y + '" x2="' + (w - PAD.r) + '" y2="' + y + '"></line>' +
        '<text class="trend-axis-text" x="' + (PAD.l - 8) + '" y="' + (y + 4) + '" text-anchor="end">' +
          Math.round(max * f) + '</text>';
    }).join('');

    const pts = series.map((d, i) => xOf(i).toFixed(1) + ',' + yOf(d.value).toFixed(1));
    const area = n > 1
      ? '<polygon class="trend-area" points="' + PAD.l + ',' + base + ' ' + pts.join(' ') + ' ' +
          xOf(n - 1).toFixed(1) + ',' + base + '"></polygon>'
      : '';
    const line = n > 1
      ? '<polyline class="trend-line" points="' + pts.join(' ') + '"></polyline>'
      : '';

    const points = series.map((d, i) =>
      '<circle class="trend-point" cx="' + xOf(i).toFixed(1) + '" cy="' + yOf(d.value).toFixed(1) + '" r="3.5">' +
        '<title>' + esc(d.label + ': ' + d.value) + '</title></circle>'
    ).join('');

    const stride = Math.max(1, Math.ceil(n / 12));
    const labels = series.map((d, i) => {
      if (i % stride !== 0 && i !== n - 1) return '';
      // Anchor the outermost labels inward so long month/date names never get
      // clipped by the SVG viewBox edge.
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      return '<text class="trend-axis-text" x="' + xOf(i).toFixed(1) + '" y="' + (h - 10) + '" ' +
        'text-anchor="' + anchor + '">' + esc(d.label) + '</text>';
    }).join('');

    return '<svg class="trend-svg" viewBox="0 0 ' + w + ' ' + h + '" role="img" ' +
      'aria-label="Trend chart, ' + esc(String(n)) + ' points">' +
      grid + area + line + points + labels +
    '</svg>';
  }

  function segmented(action, pairs, current) {
    return '<div class="segmented segmented-sm">' + pairs.map((pair) =>
      '<button type="button" class="seg' + (current === pair[0] ? ' is-active' : '') + '" ' +
      'data-action="' + action + '" data-value="' + pair[0] + '">' + pair[1] + '</button>'
    ).join('') + '</div>';
  }

  function trendPanel(r, filter) {
    const axis = activeAxis();
    const series = TT.Stats.dailySeries(r, filter, axis, chartMetric);
    const metricName = chartMetric === 'counters' ? 'Counter totals' : 'Tasks completed';
    const axisName = axis === 'month' ? 'by month' : axis === 'week' ? 'by week' : 'by day';
    const hasData = series.some((d) => d.value > 0);

    return '<section class="panel trend-panel">' +
      '<div class="panel-head">' +
        '<h2>Trend</h2>' +
        '<span class="hint">' + esc(metricName + ' · ' + axisName + ' · ' + r.label) + '</span>' +
      '</div>' +
      '<div class="trend-controls">' +
        '<div class="trend-control-row">' +
          '<span class="view-opt-label">Metric</span>' +
          segmented('set-chart-metric', [['completed', 'Tasks completed'], ['counters', 'Counter totals']], chartMetric) +
        '</div>' +
        '<div class="trend-control-row">' +
          '<span class="view-opt-label">Time axis</span>' +
          segmented('set-chart-axis', [['day', 'By day'], ['week', 'By week'], ['month', 'By month']], axis) +
        '</div>' +
      '</div>' +
      '<div class="trend-chart">' + trendSvg(series) + '</div>' +
      '<p class="hint trend-hint">' +
        (hasData
          ? 'Daily records are written as you complete tasks or change counters. Days with no recorded value read as 0; nothing is backfilled.'
          : 'No daily records in this period yet. Complete a task or use a counter to start the trend — old data starts empty, no history is invented.') +
      '</p>' +
    '</section>';
  }

  /**
   * The period's counter aggregate, explicitly labelled so a sum of daily
   * finals is never mistaken for the net change over the period.
   */
  function dailyCounterPanel(r, filter) {
    const data = TT.Stats.dailyCounterSummary(r, filter);
    return '<section class="panel">' +
      '<div class="panel-head">' +
        '<h2>Counter daily totals</h2>' +
        '<span class="hint">' + esc(r.label) + '</span>' +
      '</div>' +
      '<p class="panel-note"><strong>Σ daily final counts — not net change.</strong> ' +
        'For each counter we add up that day\'s final main count (net of +1/−1) over every day with a record. ' +
        'Days with no recorded value contribute nothing; stars are excluded.</p>' +
      (data.rows.length
        ? '<table class="data-table">' +
            '<thead><tr><th>Counter</th><th class="num">Σ daily finals</th><th class="num">Days recorded</th></tr></thead>' +
            '<tbody>' + data.rows.map((row) =>
              '<tr><td>' + esc(row.task.title) + '</td>' +
                '<td class="num">' + row.value + '</td>' +
                '<td class="num">' + row.days + '</td></tr>'
            ).join('') +
            '<tr class="table-total"><td><strong>Total</strong></td>' +
              '<td class="num"><strong>' + data.total + '</strong></td>' +
              '<td class="num">' + data.days + '</td></tr>' +
            '</tbody>' +
          '</table>'
        : '<p class="hint">No counter values recorded on any day in this period.</p>') +
    '</section>';
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

      trendPanel(r, filter) +

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
                  '<td class="bar-col"><span class="mini-bar"><span class="mini-bar-fill cat-' + color + '" style="width:' + width + '%"></span></span></td>' +
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
      '</section>' +

      dailyCounterPanel(r, filter);
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

    return '<div class="ch-block">' + head + outcomeStrip(entry) + body + '</div>';
  }

  /** "3 of 4 met", "1 exceeded target" — read straight off the stored records. */
  function outcomeStrip(entry) {
    if (!entry.known) return '';
    const chips = [];
    if (entry.met) {
      chips.push('<span class="ch-out ch-out-met">' + entry.met + ' of ' + entry.known + ' met</span>');
    }
    if (entry.missed) {
      chips.push('<span class="ch-out ch-out-missed">' + entry.missed + ' of ' + entry.known + ' missed</span>');
    }
    if (entry.exceeded) {
      chips.push('<span class="ch-out ch-out-exceeded">' + entry.exceeded + ' exceeded target</span>');
    }
    if (!chips.length) return '';

    return '<div class="ch-outcomes">' + chips.join('') +
      (entry.inferred
        ? '<span class="ch-inferred" title="These periods were recorded before per-period targets were stored, so today\'s target is used to judge them.">' +
          'earlier targets assumed</span>'
        : '') +
      '</div>';
  }

  const OUTCOME_WORDS = {
    met: 'met',
    missed: 'missed',
    exceeded: 'exceeded',
    none: 'no target',
    unknown: 'no record'
  };

  function cellTitle(cell, entry) {
    const label = entry.unit === 'day'
      ? U.formatDate(cell.key, 'long')
      : entry.unit === 'week'
        ? 'Week ' + cell.key.slice(5) + ' (' + U.formatDate(U.weekKeyToMonday(cell.key), 'short') + ')'
        : U.MONTHS[Number(cell.key.slice(5, 7)) - 1] + ' ' + cell.key.slice(0, 4);
    if (cell.value == null) return label + ' — no record';
    const pair = cell.value + (cell.target != null ? '/' + cell.target : '');
    const word = cell.open ? 'in progress' : (OUTCOME_WORDS[cell.state] || '');
    return label + ' — ' + pair + (word ? ', ' + word : '');
  }

  function counterTypeLabel(entry) {
    if (entry.type === 'cumulative') return 'Running total';
    if (entry.type === 'daily') return 'Daily counter';
    return entry.unit === 'month' ? 'Monthly target' : 'Weekly target';
  }

  function onAction(action, el) {
    if (action === 'set-granularity') {
      granularity = el.getAttribute('data-value');
      // The default axis follows the period, so a period change re-defaults it.
      chartAxis = null;
      TT.App.render();
      return true;
    }
    if (action === 'set-chart-metric') {
      chartMetric = el.getAttribute('data-value');
      TT.App.render();
      return true;
    }
    if (action === 'set-chart-axis') {
      chartAxis = el.getAttribute('data-value');
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
