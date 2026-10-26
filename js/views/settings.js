/* =========================================================================
   views/settings.js — notifications, appearance, tag management, data.
   ========================================================================= */
(function (global) {
  'use strict';

  const TT = global.TT;
  const U = TT.U;
  const UI = TT.UI;
  const esc = U.escapeHtml;

  let root = null;

  function permissionLabel() {
    const p = TT.Reminders.permission();
    if (p === 'granted') return { text: 'Allowed', tone: 'ok' };
    if (p === 'denied') return { text: 'Blocked', tone: 'bad' };
    if (p === 'unsupported') return { text: 'Not supported', tone: 'bad' };
    return { text: 'Not asked yet', tone: 'warn' };
  }

  function render(container) {
    root = container;
    const s = TT.Store.get();
    const settings = s.settings;
    const perm = permissionLabel();

    container.innerHTML =
      '<div class="page-head">' +
        '<div>' +
          '<h2 class="page-title">Settings</h2>' +
          '<p class="hint">Everything lives in this browser. Nothing is uploaded anywhere.</p>' +
        '</div>' +
      '</div>' +

      '<div class="settings-grid">' +

        '<section class="panel">' +
          '<div class="panel-head">' +
            '<h2>Reminders</h2>' +
            '<span class="status-pill tone-' + perm.tone + '">' + perm.text + '</span>' +
          '</div>' +
          '<div class="settings-row">' +
            '<label class="field-label" for="default-reminder-time">Due-date reminder time</label>' +
            '<input type="time" id="default-reminder-time" class="input input-sm" value="' + esc(settings.defaultReminderTime) + '">' +
          '</div>' +
          '<div class="settings-actions">' +
            '<button type="button" class="btn btn-ghost" data-action="enable-notifications">' + UI.icon('bell') + 'Enable notifications</button>' +
            '<button type="button" class="btn btn-ghost" data-action="test-notification">Send a test</button>' +
          '</div>' +
          '<p class="hint">Reminders only fire while this tab is open — there is no background service worker, by design. ' +
            'If notifications are blocked, nudges appear as in-app messages instead.</p>' +
          (perm.tone === 'bad'
            ? '<p class="hint hint-warn">Your browser has blocked notifications for this page. Re-allow them in the site settings (the padlock in the address bar).</p>'
            : '') +
        '</section>' +

        '<section class="panel">' +
          '<div class="panel-head"><h2>Appearance</h2></div>' +
          '<div class="settings-row">' +
            '<label class="field-label" for="theme-select">Theme</label>' +
            '<select id="theme-select" class="input input-sm">' +
              ['system', 'light', 'dark'].map((v) =>
                '<option value="' + v + '"' + (settings.theme === v ? ' selected' : '') + '>' +
                (v === 'system' ? 'Match my system' : v.charAt(0).toUpperCase() + v.slice(1)) + '</option>'
              ).join('') +
            '</select>' +
          '</div>' +
          '<p class="hint">Weeks start on Monday throughout the app.</p>' +
        '</section>' +

        tagsSection(s) +

        dataSection(s) +

      '</div>';
  }

  function tagsSection(s) {
    const catBlocks = s.categories.map((cat) => {
      const tags = s.tags.filter((t) => t.categoryId === cat.id);
      const usage = TT.Model.categoryUsage(cat.id);

      return '<div class="cat-block">' +
        '<div class="manage-row cat-row">' +
          '<i class="dot cat-' + cat.color + '"></i>' +
          '<span class="manage-name">' + esc(cat.name) + '</span>' +
          '<span class="hint">' + usage.tags + ' ' + U.plural(usage.tags, 'tag') + ' · ' + usage.tasks + ' ' + U.plural(usage.tasks, 'task') + '</span>' +
          '<span class="spacer"></span>' +
          '<button type="button" class="icon-btn" data-action="edit-category" data-id="' + cat.id + '" aria-label="Edit category">' + UI.icon('pencil') + '</button>' +
          '<button type="button" class="icon-btn is-danger" data-action="delete-category" data-id="' + cat.id + '" aria-label="Delete category">' + UI.icon('trash') + '</button>' +
        '</div>' +
        (tags.length
          ? tags.map((tag) => {
              const used = TT.Model.tagUsage(tag.id);
              return '<div class="manage-row tag-row">' +
                '<span class="manage-name">' + esc(tag.name) + '</span>' +
                '<span class="hint">' + used + ' ' + U.plural(used, 'task') + '</span>' +
                '<span class="spacer"></span>' +
                '<button type="button" class="icon-btn" data-action="edit-tag" data-id="' + tag.id + '" aria-label="Rename tag">' + UI.icon('pencil') + '</button>' +
                '<button type="button" class="icon-btn is-danger" data-action="delete-tag" data-id="' + tag.id + '" aria-label="Delete tag">' + UI.icon('trash') + '</button>' +
              '</div>';
            }).join('')
          : '<p class="hint tag-empty">No tags in this category yet.</p>') +
      '</div>';
    }).join('');

    const colorOptions = TT.Store.CATEGORY_COLORS.map((c) =>
      '<option value="' + c + '">' + c.charAt(0).toUpperCase() + c.slice(1) + '</option>'
    ).join('');

    const catOptions = s.categories.map((c) =>
      '<option value="' + c.id + '">' + esc(c.name) + '</option>'
    ).join('');

    return '<section class="panel panel-wide">' +
      '<div class="panel-head"><h2>Tags &amp; categories</h2><span class="hint">Rename or recolour anything — tasks follow along</span></div>' +
      '<div class="cat-list">' + (catBlocks || '<p class="hint">No categories yet. Add one below.</p>') + '</div>' +

      '<div class="inline-form">' +
        '<input type="text" id="new-cat-name" class="input input-sm" placeholder="New category name">' +
        '<select id="new-cat-color" class="input input-sm">' + colorOptions + '</select>' +
        '<button type="button" class="btn btn-ghost" data-action="add-category">' + UI.icon('plus') + 'Add category</button>' +
      '</div>' +

      (s.categories.length
        ? '<div class="inline-form">' +
            '<input type="text" id="new-tag-name" class="input input-sm" placeholder="New tag name">' +
            '<select id="new-tag-cat" class="input input-sm">' + catOptions + '</select>' +
            '<button type="button" class="btn btn-ghost" data-action="add-tag">' + UI.icon('plus') + 'Add tag</button>' +
          '</div>'
        : '') +
    '</section>';
  }

  function dataSection(s) {
    const json = JSON.stringify(s);
    const size = U.bytesToSize(new Blob([json]).size);
    const lastExport = s.settings.lastBackupAt
      ? new Date(s.settings.lastBackupAt).toLocaleString()
      : 'never';

    return '<section class="panel panel-wide">' +
      '<div class="panel-head"><h2>Your data</h2><span class="hint">' + size + ' in this browser</span></div>' +
      '<div class="settings-actions">' +
        '<button type="button" class="btn btn-primary" data-action="export-json">' + UI.icon('download') + 'Export JSON</button>' +
        '<button type="button" class="btn btn-ghost" data-action="import-json">' + UI.icon('upload') + 'Import JSON</button>' +
        '<input type="file" id="import-file" accept="application/json,.json" hidden>' +
        (TT.Store.hasImportSnapshot()
          ? '<button type="button" class="btn btn-ghost" data-action="undo-import">Undo last import</button>'
          : '') +
      '</div>' +
      '<p class="hint">Last export: ' + esc(lastExport) + '. Export before switching devices — the backup moves your tasks and counter history.</p>' +
      '<hr class="rule">' +
      '<div class="settings-actions">' +
        '<button type="button" class="btn btn-ghost" data-action="load-sample">Load sample data</button>' +
        '<button type="button" class="btn btn-ghost btn-danger-text" data-action="reset-all">Erase everything</button>' +
      '</div>' +
      '<p class="hint">Loading sample data or erasing replaces everything currently stored.</p>' +
    '</section>';
  }

  /* ------------------------------------------------------------- prompts */

  function promptText(opts) {
    return new Promise((resolve) => {
      let answered = false;
      const m = UI.modal({
        title: opts.title,
        size: 'sm',
        body: '<div class="field">' +
          '<label class="field-label" for="prompt-input">' + esc(opts.label) + '</label>' +
          '<input id="prompt-input" class="input" value="' + esc(opts.value || '') + '" ' +
            'placeholder="' + esc(opts.placeholder || '') + '">' +
        '</div>',
        footer: '<span class="spacer"></span>' +
          '<button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
          '<button type="button" class="btn btn-primary" data-ok>Save</button>',
        onClose: () => {
          if (!answered) resolve(null);
        }
      });
      const input = m.body.querySelector('#prompt-input');
      input.select();
      function ok() {
        answered = true;
        const value = input.value.trim();
        m.close();
        resolve(value || null);
      }
      m.footer.querySelector('[data-ok]').addEventListener('click', ok);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') ok();
      });
    });
  }

  /**
   * Rename a category and pick its colour in one place. The colour is what
   * every task card, calendar pill and group header reads, so it has to be
   * editable — not just settable when the category is created.
   */
  function promptCategory(cat) {
    const swatches = TT.Store.CATEGORY_COLORS.map((c) =>
      '<label class="swatch cat-' + c + (cat.color === c ? ' is-on' : '') + '" title="' + c + '">' +
        '<input type="radio" name="cat-color" value="' + c + '"' + (cat.color === c ? ' checked' : '') + '>' +
        '<span class="swatch-dot"></span>' +
      '</label>'
    ).join('');

    return new Promise((resolve) => {
      let answered = false;
      const m = UI.modal({
        title: 'Edit category',
        size: 'sm',
        body: '<div class="field">' +
            '<label class="field-label" for="prompt-input">Category name</label>' +
            '<input id="prompt-input" class="input" value="' + esc(cat.name) + '">' +
          '</div>' +
          '<div class="field">' +
            '<span class="field-label">Colour</span>' +
            '<div class="swatch-row">' + swatches + '</div>' +
          '</div>',
        footer: '<span class="spacer"></span>' +
          '<button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
          '<button type="button" class="btn btn-primary" data-ok>Save</button>',
        onClose: () => {
          if (!answered) resolve(null);
        }
      });

      const input = m.body.querySelector('#prompt-input');
      input.select();
      m.body.querySelectorAll('input[name="cat-color"]').forEach((radio) => {
        radio.addEventListener('change', () => {
          m.body.querySelectorAll('.swatch').forEach((s) => s.classList.remove('is-on'));
          radio.closest('.swatch').classList.add('is-on');
        });
      });

      function ok() {
        answered = true;
        const checked = m.body.querySelector('input[name="cat-color"]:checked');
        const patch = {
          name: input.value.trim() || cat.name,
          color: checked ? checked.value : cat.color
        };
        m.close();
        resolve(patch);
      }
      m.footer.querySelector('[data-ok]').addEventListener('click', ok);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') ok();
      });
    });
  }

  function showErrors(title, errors) {
    UI.modal({
      title,
      size: 'sm',
      autofocus: false,
      body: '<p class="hint">Nothing was changed. The file has these problems:</p>' +
        '<ul class="error-list">' + errors.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>',
      footer: '<span class="spacer"></span><button type="button" class="btn btn-primary" data-close>Close</button>'
    });
  }

  function deleteCategoryFlow(cat) {
    const usage = TT.Model.categoryUsage(cat.id);
    const others = TT.Store.get().categories.filter((c) => c.id !== cat.id);

    if (!usage.tags) {
      UI.confirmDialog({
        title: 'Delete “' + esc(cat.name) + '”?',
        message: 'This category has no tags, so nothing else is affected.',
        confirmText: 'Delete category',
        danger: true
      }).then((ok) => {
        if (!ok) return;
        TT.Model.deleteCategory(cat.id, { mode: 'delete' });
        UI.toast('Category deleted', 'success');
      });
      return;
    }

    const m = UI.modal({
      title: 'Delete “' + esc(cat.name) + '”?',
      size: 'sm',
      autofocus: false,
      body: '<p class="confirm-text">' + usage.tags + ' ' + U.plural(usage.tags, 'tag') + ' in this category ' +
        (usage.tags === 1 ? 'is' : 'are') + ' used by ' + usage.tasks + ' ' + U.plural(usage.tasks, 'task') + '. What should happen to them?</p>' +
        '<div class="radio-list">' +
          '<label class="check-row"><input type="radio" name="cat-strategy" value="move"' + (others.length ? ' checked' : ' disabled') + '>' +
            '<span>Move the tags to ' +
              (others.length
                ? '<select id="move-target" class="input input-sm">' + others.map((c) =>
                    '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') + '</select>'
                : 'another category (none exist)') +
            '</span></label>' +
          '<label class="check-row"><input type="radio" name="cat-strategy" value="delete"' + (others.length ? '' : ' checked') + '>' +
            '<span>Delete the tags and remove them from those tasks</span></label>' +
        '</div>',
      footer: '<span class="spacer"></span>' +
        '<button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
        '<button type="button" class="btn btn-danger" data-ok>Delete</button>'
    });

    m.footer.querySelector('[data-ok]').addEventListener('click', () => {
      const picked = m.el.querySelector('input[name="cat-strategy"]:checked');
      const mode = picked ? picked.value : 'delete';
      if (mode === 'move') {
        const target = m.el.querySelector('#move-target');
        if (!target) {
          UI.toast('Pick a category to move the tags into.', 'error');
          return;
        }
        TT.Model.deleteCategory(cat.id, { mode: 'move', toId: target.value });
      } else {
        TT.Model.deleteCategory(cat.id, { mode: 'delete' });
      }
      m.close();
      UI.toast('Category deleted', 'success');
    });
  }

  function handleImportFile(file) {
    U.readFileText(file).then((text) => {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        showErrors('That file is not valid JSON', ['The file could not be parsed. It may be truncated or not a JSON export.']);
        return;
      }

      const result = TT.Store.validateImport(parsed);
      if (!result.ok) {
        showErrors('That file could not be imported', result.errors);
        return;
      }

      const exportedAt = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString() : 'an unknown date';
      const counts = result.state.tasks.length;

      UI.confirmDialog({
        title: 'Replace everything with this backup?',
        message: 'The file holds ' + counts + ' ' + U.plural(counts, 'task') + ', ' +
          result.state.tags.length + ' tags and ' + result.state.categories.length + ' categories, exported ' + exportedAt + '.',
        detail: 'Your current data will be replaced. A snapshot is kept so you can undo this once.',
        confirmText: 'Replace my data',
        danger: true
      }).then((ok) => {
        if (!ok) return;
        TT.Store.importState(result.state);
        // Imported counters may have been idle for days — settle them onto
        // the current period before anything renders.
        TT.Counters.reconcileAll();
        UI.toast('Backup imported', 'success');
      });
    }).catch(() => {
      showErrors('Could not read that file', ['The browser refused to read it. Try exporting again and re-importing.']);
    });
  }

  /* ------------------------------------------------------------- actions */

  function onAction(action, el) {
    const s = TT.Store.get();

    if (action === 'enable-notifications') {
      TT.Reminders.requestPermission().then((result) => {
        if (result === 'granted') UI.toast('Notifications enabled', 'success');
        else if (result === 'denied') UI.toast('Blocked by the browser — nudges will show in-app instead.', 'error', 5000);
        else if (result === 'unsupported') UI.toast('This browser has no Notification support.', 'error');
        TT.App.render();
      });
      return true;
    }

    if (action === 'test-notification') {
      const mode = TT.Reminders.test();
      UI.toast(mode === 'notification' ? 'Test notification sent' : 'Shown as an in-app message', 'info');
      return true;
    }

    if (action === 'add-category') {
      const input = root.querySelector('#new-cat-name');
      const color = root.querySelector('#new-cat-color');
      const name = input ? input.value.trim() : '';
      if (!name) {
        UI.toast('Give the category a name first.', 'error');
        if (input) input.focus();
        return true;
      }
      TT.Model.addCategory(name, color ? color.value : 'blue');
      UI.toast('Category added', 'success');
      return true;
    }

    if (action === 'edit-category') {
      const cat = TT.Model.categoryById(el.getAttribute('data-id'));
      if (!cat) return true;
      promptCategory(cat).then((patch) => {
        if (!patch) return;
        TT.Model.updateCategory(cat.id, patch);
        UI.toast('Category updated', 'success');
      });
      return true;
    }

    if (action === 'delete-category') {
      const cat = TT.Model.categoryById(el.getAttribute('data-id'));
      if (cat) deleteCategoryFlow(cat);
      return true;
    }

    if (action === 'add-tag') {
      const input = root.querySelector('#new-tag-name');
      const select = root.querySelector('#new-tag-cat');
      const name = input ? input.value.trim() : '';
      if (!name) {
        UI.toast('Give the tag a name first.', 'error');
        if (input) input.focus();
        return true;
      }
      if (!select) return true;
      TT.Model.addTag(name, select.value);
      UI.toast('Tag added', 'success');
      return true;
    }

    if (action === 'edit-tag') {
      const tag = TT.Model.tagById(el.getAttribute('data-id'));
      if (!tag) return true;
      promptText({ title: 'Rename tag', label: 'Tag name', value: tag.name }).then((name) => {
        if (name) TT.Model.updateTag(tag.id, { name });
      });
      return true;
    }

    if (action === 'delete-tag') {
      const tag = TT.Model.tagById(el.getAttribute('data-id'));
      if (!tag) return true;
      const used = TT.Model.tagUsage(tag.id);
      UI.confirmDialog({
        title: 'Delete the tag “' + esc(tag.name) + '”?',
        message: used
          ? 'It will be removed from ' + used + ' ' + U.plural(used, 'task') + '. The tasks themselves stay.'
          : 'Nothing is using this tag yet.',
        confirmText: 'Delete tag',
        danger: true
      }).then((ok) => {
        if (!ok) return;
        TT.Model.deleteTag(tag.id);
        UI.toast('Tag deleted', 'success');
      });
      return true;
    }

    if (action === 'export-json') {
      const json = TT.Store.exportJSON();
      U.downloadText('task-tracker-' + U.todayKey() + '.json', json, 'application/json');
      TT.Store.setSetting('lastBackupAt', U.nowISO());
      UI.toast('Backup downloaded', 'success');
      return true;
    }

    if (action === 'import-json') {
      const file = root.querySelector('#import-file');
      if (file) file.click();
      return true;
    }

    if (action === 'undo-import') {
      UI.confirmDialog({
        title: 'Undo the last import?',
        message: 'This restores the snapshot taken just before you imported.',
        confirmText: 'Restore snapshot'
      }).then((ok) => {
        if (!ok) return;
        if (TT.Store.undoImport()) UI.toast('Snapshot restored', 'success');
        else UI.toast('No snapshot available', 'error');
      });
      return true;
    }

    if (action === 'load-sample') {
      UI.confirmDialog({
        title: 'Load sample data?',
        message: 'This replaces every task, counter and tag currently stored.',
        detail: 'Export first if you want to keep what you have.',
        confirmText: 'Load samples',
        danger: true
      }).then((ok) => {
        if (!ok) return;
        TT.Store.loadSample();
        TT.Counters.reconcileAll();
        UI.toast('Sample data loaded', 'success');
        TT.App.navigate('tasks');
      });
      return true;
    }

    if (action === 'reset-all') {
      UI.confirmDialog({
        title: 'Erase everything?',
        message: 'All tasks, counters, tags and settings will be deleted from this browser.',
        detail: 'This cannot be undone unless you have an exported JSON file.',
        confirmText: 'Erase everything',
        danger: true
      }).then((ok) => {
        if (!ok) return;
        TT.Store.resetAll();
        UI.toast('Everything cleared', 'success');
        TT.App.navigate('tasks');
      });
      return true;
    }

    return false;
  }

  function bind(container) {
    const time = container.querySelector('#default-reminder-time');
    if (time) {
      time.addEventListener('change', () => {
        TT.Store.setSetting('defaultReminderTime', time.value || '09:00');
      });
    }

    const theme = container.querySelector('#theme-select');
    if (theme) {
      theme.addEventListener('change', () => {
        TT.Store.setSetting('theme', theme.value);
      });
    }

    const file = container.querySelector('#import-file');
    if (file) {
      file.addEventListener('change', () => {
        if (file.files && file.files[0]) handleImportFile(file.files[0]);
        file.value = '';
      });
    }
  }

  TT.Views = TT.Views || {};
  TT.Views.settings = { render, onAction, bind };
})(typeof window !== 'undefined' ? window : globalThis);
