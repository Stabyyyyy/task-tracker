# Task Tracker

A personal task tracker that runs entirely in your browser. No account, no server, no build step. Everything — tasks, tags, counters, priorities, reminder settings — lives in `localStorage`, and you move it between devices with the Export / Import JSON buttons.

![no dependencies](https://img.shields.io/badge/dependencies-none-brightgreen) ![no build](https://img.shields.io/badge/build-none-blue)

## Run it

**Locally:** double-click `index.html`. It works from `file://` because the app uses classic `<script>` tags rather than ES modules.

**Or serve it** (recommended, since `file://` gives every page the same storage origin):

```bash
python -m http.server 8000
# then open http://localhost:8000
```

**GitHub Pages:** push this folder to a public repo, then Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`. The included `.nojekyll` file keeps Jekyll out of the way. The site appears at `https://<user>.github.io/<repo>/` after a minute or two.

## What's in it

**Tasks** — title (required), notes, due date, tags. Complete, edit, archive, restore, delete. Overdue tasks are highlighted and grouped first. The title is deliberately the largest, heaviest text on the card.

**Tags with categories** — categories are the broad buckets (Work / Life / Study), tags live inside them, and a task can carry several tags. Everything is referenced by id, so renaming a tag or category updates every task automatically.

**Colour coding** — every category has a colour, editable in Settings (name + colour swatches). Task cards, counter cards, repeating tasks and calendar pills all carry it: a coloured bar down the left edge plus one pill per tag in that tag's own category colour. If a categorised task is also overdue, the category bar wins and the overdue signal moves to a red badge, red date text and a red outline.

**Pins** — every task type has a pin toggle. Pinned tasks sit in a **Pinned** group at the top of the list, above every other group, regardless of the active sort or grouping; the active sort still applies *inside* the pinned group. Pinned cards show a pin icon, and calendar pills get a small pin mark while staying on their due date.

**Subtasks** — available on non-counter tasks only (counters can't have them). Each has a required name, optional date, a completed checkbox, optional notes, an implicit order and an optional completion timestamp. They render as a checklist inside the parent card in listed order, with no locking — any subtask can be checked in any order. The card shows `x/n` progress and the parent is complete only when every subtask is checked; checking the parent's own checkbox checks or unchecks them all. There is no extra confirmation or blocking guard. Subtasks carry no tags or priority of their own; they follow the parent.

**Custom priorities** — a dimension separate from tags/categories, available on every task type. Create labels in Settings with a name, a numeric level and a colour; rename, recolor, reorder or delete them. Renaming updates every task using that label; deleting reassigns its tasks to **No priority** and never blocks. Leveled tasks show a coloured pill; tasks with no priority show no badge. Priorities can sort (asc/desc), group, and multi-select filter. "No priority" is its own bucket and is excluded from ordering among leveled tasks. Priority is deliberately excluded from Review stats.

**Type tabs** — the Tasks view has **All tasks / Counter / One-time / Recurring** above the toolbar. Classification is implicit from the task's fields: anything with a counter is a Counter even if it also recurs; subtasks follow their parent. Category grouping and the existing filters still work under every tab.

**Group and sort** — the list can group by due date (default), category or priority, and sort by due date, category, tag, creation date or priority (asc/desc). **Progress (asc/desc)** is an extra sort available only in the Counter tab — progress is `current main count ÷ target`, or the raw count when no target is set. Group headers are collapsible and show the category colour. Both choices are saved, so the list opens the way you left it. Pinned tasks always float above all of it.

**Filters** — tag, tag category, due-date range, title search, plus a multi-select priority filter. The calendar and the review page carry their own tag filters.

**Counters** — three kinds:

| Type | Resets | Target | Example |
|---|---|---|---|
| Daily | every day at midnight | optional | 8 glasses of water |
| Cumulative | never | optional | 12 books this year |
| Periodic | weekly or monthly | usually | guitar 3× this week |

All have `+1` / `−1`, an extra **⭐ +1** (special) and a **⭐ −1** (minus star). A normal `+1` adds one to the main count; the special one adds one to the main count *and* one to a separate cumulative **star** total shown as `⭐ 6` on the card. The minus-star button removes exactly one star, clamped at zero, and leaves the main count, target and progress alone — it's the way to undo a mis-pressed special `+1`. The plain `−1` still never touches stars, stars never count toward the target, and the main count is clamped at zero. Hitting the target turns the card green, shows a "Goal met" badge, and cancels that period's reminder. Counter cards sit in a responsive grid (2–3 columns, one column on narrow screens, no horizontal scrolling).

**Repeating tasks** — every N days / weeks / months, forever or until a date. Completing an instance keeps it as a record and generates exactly one successor. The successor inherits the pin and priority, and keeps the subtask checklist with every item reset to unchecked.

**Reminders** — browser notifications, only while the tab is open. Per-task toggles for the due date, the next repeat, and "target not met by *HH:MM*". If the browser blocks notifications, nudges appear as in-app messages instead.

**Review** — week / month / year, with completed counts, two completion rates, a per-tag breakdown, and counter history. Each closed counter period is stored with its own start date, end date, final count, the target that was in force and the outcome, so the review page can say "3 of 4 met", "1 of 4 missed" and "1 exceeded target" without re-judging the past against today's target. A trend chart appears on all three periods: pick **Tasks completed** or **Counter totals**, and switch the time axis between **By day / By week / By month** (the default follows the selected period — day for Week, week for Month, month for Year). The chart is display-only. A separate table sums each counter's daily final counts over the period, explicitly labelled **"Σ daily final counts — not net change"**.

**Backup** — Export JSON downloads everything; Import validates the file first and asks before replacing anything.

## How the tricky bits actually behave

**Dates are local.** Everything is a `YYYY-MM-DD` calendar date built from `getFullYear/getMonth/getDate`. Nothing is derived from `toISOString()`, so a task due "today" stays today regardless of your UTC offset. Weeks start on Monday, and ISO week keys are computed in UTC so a DST shift can't move a week.

**Counter rollover is checked on read *and* on write.** A tab left open across midnight, or a `+1` clicked at 00:00:30, lands in the correct period. Rollover only moves forward and never overwrites an existing history entry, so a clock change can't erase a day. Skipped periods are backfilled with an explicit `0` — that's what lets the review page distinguish "recorded zero" from "app wasn't opened". When a daily counter's period closes, the day that just ended is finalised in the daily ledger from `history[day]`, but never overwrites a value the user already recorded.

**Cumulative totals are derived, not stored.** Each day's *delta* goes into history and the total is summed on read. One source of truth, no drift.

**Closed periods get a record; the live one doesn't.** When a counter rolls over, the period that just ended is written to `counter.periods[key]` with `{ start, end, value, target, outcome }`. `history[key]` stays a plain number and remains the ledger everything else reads — the record only adds the target that was in force at the time. The current period is never recorded, so it can't be counted as "missed" halfway through a week. Targets were not stored before v2, so records rebuilt from older data are flagged `inferred` and the review page says so instead of pretending they were measured.

**The daily ledger is written at mutation time, never backfilled.** `state.daily[YYYY-MM-DD]` holds `completed` (non-counter completions counted by `completedAt`, *not* due date) and `counters` (each counter's final main count that day, net of `+1`/`−1`). Re-opening a task or deleting a done one decrements that same day. Old data starts with an empty ledger — no history is invented. Days with no recorded value contribute nothing, which is why the aggregated counter table says "not net change". The new trend chart and counter-total table read this ledger; the existing Week/Month/Year metric cards still come from task timestamps so older stats are not erased by the new schema.

**Parent completion is derived from subtasks.** Checking the last item completes the parent; unchecking any item reopens it. The parent checkbox is a bulk check/uncheck. No dialog, no "you can't complete this yet" guard. Counters always have an empty subtask list.

**Pin precedence is applied before everything else.** Pinned tasks are split into their own top group before sorting/grouping, and the chosen sort still runs inside that group. A priority filter can hide a pinned task, but it can never push a pinned task below an unpinned one.

**Priority "None" is a real bucket.** `priorityId: null` is grouped and sorted into a separate "No priority" bucket at the end of leveled tasks, and renders no pill. Priority definitions are stored once and referenced by id, so a rename is a single edit. The priority filter is ignored by Review stats on purpose.

**Migration is additive.** v1 and v2 data are upgraded in place on first load: `version` becomes 3, missing `pinned` becomes `false`, missing `priorityId` becomes `null`, missing `subtasks` becomes `[]`, missing `counter.stars` becomes `0`, and `priorities` / `daily` start empty. `settings.listView` gains `typeTab: "all"`. `history` keeps its numeric shape, so a v1 export still imports cleanly and an older build can still read new data. An export made before v3 — with no priority definitions — imports with an empty priority list rather than failing.

**Repeats are anchored to a day-of-month.** A task due on the 31st goes 31 Jan → 28 Feb → **31 Mar**, not 28 Mar. If you're overdue by several intervals, completing it jumps to the first future occurrence and records how many were skipped, so your completion rate doesn't quietly improve.

**Un-completing a repeat** removes the generated successor, but only if you never touched it. If you edited or completed the successor, it's kept and you get a warning instead.

**Editing a repeat's rule** takes effect from the next occurrence — switching weekly to every 2 weeks means the next one lands two weeks out. Completed instances are history and never change.

**Completion rate is shown two ways**, labelled: *due-based* (finished ÷ tasks due in the period) and *created-based* (finished ÷ tasks created in the period). No-due-date tasks are excluded from the due-based figure by definition.

**Archiving ≠ deleting.** Archiving hides a task from the list and keeps it for stats; only the archive view offers a permanent delete.

## Files

```
index.html            shell, nav, script order
css/styles.css        design tokens (light + dark), all components
js/util.js            date keys, ISO weeks, month clamping, formatting
js/store.js           localStorage schema, migration, import validation
js/daily.js           daily ledger writes and normalisation
js/model.js           task/tag/category/priority CRUD, filtering, completion rules
js/recurrence.js      next-due maths, catch-up, spawning
js/counters.js        period keys, rollover, increments, stars, progress
js/stats.js           period ranges, aggregation, daily series
js/reminders.js       scheduler, dedupe, Notification + toast fallback
js/ui.js              toasts, modals, cards, the task editor
js/app.js             router, render loop, shared actions
js/views/*.js         tasks, calendar, stats, archive, settings
```

Load order in `index.html` matters — these are plain scripts sharing a global `TT` namespace. Add a file, add a `<script>` tag before `app.js`. `js/daily.js` loads after `store.js` and before `model.js`.

## Tweak it

- **Colours** live at the top of `styles.css`: `--accent`, `--bg`, `--surface`, `--danger`, `--success`. Dark mode is the `[data-theme="dark"]` block; category colours are the `.cat-*` classes, and the eight choices offered in Settings come from `CATEGORY_COLORS` in `store.js`. Priority labels reuse the same eight tokens (`PRIORITY_COLORS` in `model.js`).
- **New task field** — add it to the draft in `ui.js` (`toDraft`, `buildPayload`, `dynamicHtml`), read it in `model.js` (`createTask`, `updateTask`), then render it in `ui.js` (`taskCard`). Also add it to `validateImport()` in `store.js` or it will be dropped on import. Existing data keeps working because missing fields fall back to defaults.
- **New view** — add a route name to `ROUTES` in `app.js`, register `TT.Views.<route> = { render, onAction }`, add a tab in `index.html`.
- **New sort order** — add a key to `SORT_KEYS` in `store.js` and a branch in `compareBy()` in `model.js`, then an `<option>` in `viewOptsHtml()` in `views/list.js`.
- **Schema changes** — bump `APP_VERSION` in `store.js` and handle the old shape in `migrate()` / `normalizeV3()`. Exported files carry their version, and imports from a newer version are rejected.

## Data format

`localStorage["tasktracker.v1"]` holds:

```js
{
  version: 3,
  tasks: [...], categories: [...], tags: [...],
  priorities: [{ id, name, level, color }],
  daily: {
    "2026-10-26": { completed: 2, counters: { "task_abc": 3 } }
  },
  settings: {
    defaultReminderTime, theme, notified, lastBackupAt,
    listView: {
      groupBy: "date" | "category" | "priority",
      sortBy: "due" | "category" | "tag" | "created" |
              "priority-asc" | "priority-desc" | "progress-asc" | "progress-desc",
      typeTab: "all" | "counter" | "plain" | "recurring"
    }
  },
  meta: { createdAt, updatedAt }
}
```

Each task gains:

```js
{
  pinned: false,
  priorityId: null,                 // id from `priorities`, or null for None
  subtasks: [                      // always [] for counters
    { id, name, date, notes, completed, completedAt, order }
  ]
}
```

A counter keeps two parallel maps — `history` is the numeric ledger, `periods` the per-period snapshot — plus the cumulative star total:

```js
counter: {
  type: "daily" | "cumulative" | "periodic",
  target: 4, value: 3, periodKey: "2026-10-26",
  stars: 6,
  history: { "2026-10-25": 5, "2026-10-26": 3 },
  periods: {
    "2026-10-25": { start: "2026-10-25", end: "2026-10-25",
                    value: 5, target: 4, outcome: "exceeded", inferred: false }
  }
}
```

Exports wrap that in an envelope:

```js
{ app: "tasktracker", version: 3, exportedAt: "2026-10-26T...", state: { ... } }
```

Import checks the envelope, the version, every id, every date (rejecting things like `2026-02-31`), tag references, priority references, the daily map, and the shape of each counter and repeat. Missing v3 fields are filled with safe defaults rather than failing the import. Any failure aborts the whole import with a path-qualified error (`tasks[3].dueDate`) and changes nothing. A snapshot of your previous data is kept so you can undo once.

## Known limits

- **Reminders need the tab open.** No service worker, no background push — that's a deliberate constraint, not an oversight.
- **`localStorage` is per-origin.** `file://` and `github.io` are different origins, so data does not follow you. Export, then import on the other side.
- **No sync or accounts.** One browser, one dataset.
- **Notification permission can be permanently denied**; the in-app toast is the fallback, not an equivalent.
- **Import replaces, it never merges** — merging would need conflict rules for ids and repeat series.
- **The daily ledger starts the day v3 is installed.** There is no backfill for earlier days, by design; days with no recorded value count as nothing in the trend chart and the counter-total table.
- **GitHub Pages caches HTML for a few minutes.** Hard-refresh after deploying an update.

## Manual test checklist

Baseline regression:

1. Add a task with a due date in the past — it should appear under **Overdue** with a red edge, and its category colour bar should still be visible.
2. Complete it — it leaves the list, and the toast offers **Undo**.
3. Archive something, then restore it from the archive.
4. Create a daily counter with a target of 3, press `+` three times — the card turns green with "Goal met".
5. Create a repeat "every 2 weeks", complete it, check the new instance is 14 days out.
6. Switch **Group by** to Category and **Sort by** to Created — counters and repeats should sit inside their category, and the headers should collapse when clicked.
7. Settings → Tags & categories → pencil next to a category — change its colour and watch every card and calendar pill follow.
8. Reload the page — everything is still there, including the group/sort choice.
9. Export, erase everything, import the file — you're back where you were.
10. Open Review, switch Week / Month / Year, and click a tag chip.

The nine v3 changes:

1. **Pin** — click the pin on a one-time task, a counter and a repeat. Each moves into the **Pinned** group at the very top. Change sort/grouping; pinned stays first. Open Calendar — the pinned task has a pin mark but is still on its due date.
2. **Title typography** — on any card, the title should be visibly the largest/heaviest text; nothing else changed size or moved.
3. **Subtasks** — edit or create a plain task, add two subtasks in the editor, save. The card shows `0/2`. Check them in reverse order (no locking); after the second, the parent is complete. Uncheck one and it reopens. Open a counter's editor — there is no subtask section.
4. **Stars** — on a counter, press normal `+1` (main +1, `⭐` unchanged), `⭐ +1` (main +1 and `⭐` +1), `−1` (main −1, `⭐` unchanged), then `⭐ −1` (`⭐` −1, main unchanged). Press `⭐ −1` repeatedly at zero — it stays at 0. `⭐` never changes the target/progress.
5. **Counter grid** — with 3+ counters, they should share 2–3 columns with no large blank area on the right. Narrow the window below ~760px: they stack into one column with no horizontal scrollbar.
6. **Progress sort** — open the **Counter** tab; **Progress (asc/desc)** appears in Sort. Switch to **All tasks** — the option disappears and the previous sort is restored.
7. **Type tabs** — click Counter / One-time / Recurring and confirm only that type shows; a recurring counter belongs to Counter, and a task with subtasks stays in its parent's tab. Category grouping still works under each tab.
8. **Daily stats + trend** — complete a plain task and nudge a counter; open Review. The trend chart appears on Week, Month and Year. Switch the metric to **Counter totals** and the axis between **By day / By week / By month**; the default axis follows the period. The counter table says **"Σ daily final counts — not net change"**. There is no priority breakdown anywhere in Review.
9. **Priority** — Settings → Priorities, create two labels with different levels and colours, rename one (its tasks update), reorder them, then delete one (its tasks fall back to No priority, nothing blocks). On the list, use **Priority (asc/desc)** sort, **Group by priority**, and the priority filter chips; confirm a **No priority** bucket exists and that pinned tasks still float above everything.
