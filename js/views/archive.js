/* =========================================================================
   views/archive.js — archived tasks: restorable, and the only place where a
   permanent delete lives.
   ========================================================================= */
(function (global) {
  'use strict';

  const TT = global.TT;
  const U = TT.U;
  const UI = TT.UI;
  const esc = U.escapeHtml;

  function render(container) {
    const filter = Object.assign(TT.Model.emptyFilters(), { status: 'archived' });
    const list = TT.Model.visibleTasks(filter).sort((a, b) => {
      const aa = a.archivedAt || a.updatedAt;
      const bb = b.archivedAt || b.updatedAt;
      return aa < bb ? 1 : -1;
    });

    container.innerHTML =
      '<div class="page-head">' +
        '<div>' +
          '<h2 class="page-title">Archive</h2>' +
          '<p class="hint">' + (list.length ? list.length + ' ' + U.plural(list.length, 'task') + ' set aside' : 'Nothing archived') +
            ' · hidden from the task list but kept for your records</p>' +
        '</div>' +
      '</div>' +
      (list.length
        ? '<div class="archive-list">' + list.map((t) => UI.taskCard(t, { context: 'archive' })).join('') + '</div>'
        : UI.emptyState({
            icon: 'archive',
            title: 'The archive is empty',
            text: 'Archiving a task hides it from your list without deleting it. Good for things you finished or gave up on.'
          }));
  }

  TT.Views = TT.Views || {};
  TT.Views.archive = { render, onAction: () => false };
})(typeof window !== 'undefined' ? window : globalThis);
