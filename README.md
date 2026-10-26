# Task Tracker

A personal task tracker that runs entirely in your browser. No account, no server, no build step. Everything — tasks, tags, counters, reminder settings — lives in `localStorage`, and you move it between devices with the Export / Import JSON buttons.

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

**Tasks** — title (required), notes, due date, tags. Complete, edit, archive, restore, delete. Overdue tasks are highlighted and grouped first.

**Tags with categories** — categories are the broad buckets (Work / Life / Study), tags live inside them, and a task can carry several tags. Everything is referenced by id, so renaming a tag or category updates every task automatically.

**Colour coding** — every category has a colour, editable in Settings (name + colour swatches). Task cards, counter cards, repeating tasks and calendar pills all carry it: a coloured bar down the left edge plus one pill per tag in that tag's own category colour. A task tagged in two categories therefore shows one bar and two differently coloured pills. If a categorised task is also overdue, the category bar wins and the overdue signal moves to a red badge, red date text and a red outline.

**Views** — task list with grouping and search; monthly calendar; review page; archive; settings.

**Group and sort** — the list can group by due date (default) or by category, and sort by due date, category, tag or creation date. Group headers are collapsible and show the category colour. Both choices are saved, so the list opens the way you left it. In category mode counters and repeating tasks sit inside their own category rather than in a separate block.

**Filters** — tag, tag category, due-date range, title search. The calendar and the review page carry their own tag filters.

**Counters** — three kinds:

| Type | Resets | Target | Example |
|---|---|---|---|
| Daily | every day at midnight | optional | 8 glasses of water |
| Cumulative | never | optional | 12 books this year |
| Periodic | weekly or monthly | usually | guitar 3× this week |

All have `+1` / `−1`. Hitting the target turns the card green, shows a "Goal met" badge, and cancels that period's reminder.

**Repeating tasks** — every N days / weeks / months, forever or until a date. Completing an instance keeps it as a record and generates exactly one successor.

**Reminders** — browser notifications, only while the tab is open. Per-task toggles for the due date, the next repeat, and "target not met by *HH:MM*". If the browser blocks notifications, nudges appear as in-app messages instead.

**Review** — week / month / year, with completed counts, two completion rates, a per-tag breakdown, and counter history. Each closed counter period is stored with its own start date, end date, final count, the target that was in force and the outcome, so the review page can say "3 of 4 met", "1 of 4 missed" and "1 exceeded target" without re-judging the past against today's target.

**Backup** — Export JSON downloads everything; Import validates the file first and asks before replacing anything.

## How the tricky bits actually behave

**Dates are local.** Everything is a `YYYY-MM-DD` calendar date built from `getFullYear/getMonth/getDate`. Nothing is derived from `toISOString()`, so a task due "today" stays today regardless of your UTC offset. Weeks start on Monday, and ISO week keys are computed in UTC so a DST shift can't move a week.

**Counter rollover is checked on read *and* on write.** A tab left open across midnight, or a `+1` clicked at 00:00:30, lands in the correct period. Rollover only moves forward and never overwrites an existing history entry, so a clock change can't erase a day. Skipped periods are backfilled with an explicit `0` — that's what lets the review page distinguish "recorded zero" from "app wasn't opened".

**Cumulative totals are derived, not stored.** Each day's *delta* goes into history and the total is summed on read. One source of truth, no drift.

**Closed periods get a record; the live one doesn't.** When a counter rolls over, the period that just ended is written to `counter.periods[key]` with `{ start, end, value, target, outcome }`. `history[key]` stays a plain number and remains the ledger everything else reads — the record only adds the target that was in force at the time. The current period is never recorded, so it can't be counted as "missed" halfway through a week. Targets were not stored before v2, so records rebuilt from older data are flagged `inferred` and the review page says so instead of pretending they were measured.

**Migration is additive.** v1 data is upgraded in place on first load: period records are rebuilt from `history`, `settings.listView` is filled with defaults, and `version` becomes 2. `history` keeps its numeric shape, so a v1 export still imports cleanly and an older build can still read new data.

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
js/model.js           task/tag/category CRUD, filtering, completion rules
js/recurrence.js      next-due maths, catch-up, spawning
js/counters.js        period keys, rollover, increments, progress
js/stats.js           period ranges and aggregation
js/reminders.js       scheduler, dedupe, Notification + toast fallback
js/ui.js              toasts, modals, cards, the task editor
js/app.js             router, render loop, shared actions
js/views/*.js         tasks, calendar, stats, archive, settings
```

Load order in `index.html` matters — these are plain scripts sharing a global `TT` namespace. Add a file, add a `<script>` tag before `app.js`.

## Tweak it

- **Colours** live at the top of `styles.css`: `--accent`, `--bg`, `--surface`, `--danger`, `--success`. Dark mode is the `[data-theme="dark"]` block; category colours are the `.cat-*` classes, and the eight choices offered in Settings come from `CATEGORY_COLORS` in `store.js`.
- **New task field** — add it to the draft in `ui.js` (`toDraft`, `buildPayload`, `dynamicHtml`), read it in `model.js` (`createTask`, `updateTask`), then render it in `ui.js` (`taskCard`). Existing data keeps working because missing fields fall back to defaults.
- **New view** — add a route name to `ROUTES` in `app.js`, register `TT.Views.<route> = { render, onAction }`, add a tab in `index.html`.
- **New sort order** — add a key to `SORTS` and a branch in `compareBy()` in `model.js`, then an `<option>` in `viewOptsHtml()` in `views/list.js`.
- **Schema changes** — bump `APP_VERSION` in `store.js` and handle the old shape in `migrate()`. Exported files carry their version, and imports from a newer version are rejected.

## Data format

`localStorage["tasktracker.v1"]` holds:

```js
{
  version: 2,
  tasks: [...], categories: [...], tags: [...],
  settings: {
    defaultReminderTime, theme, notified, lastBackupAt,
    listView: { groupBy: "date" | "category", sortBy: "due" | "category" | "tag" | "created" }
  },
  meta: { createdAt, updatedAt }
}
```

A counter keeps two parallel maps — `history` is the numeric ledger, `periods` the per-period snapshot:

```js
counter: {
  type: "daily" | "cumulative" | "periodic",
  target: 4, value: 3, periodKey: "2026-10-26",
  history: { "2026-10-25": 5, "2026-10-26": 3 },
  periods: {
    "2026-10-25": { start: "2026-10-25", end: "2026-10-25",
                    value: 5, target: 4, outcome: "exceeded", inferred: false }
  }
}
```

Exports wrap that in an envelope:

```js
{ app: "tasktracker", version: 2, exportedAt: "2026-10-26T...", state: { ... } }
```

Import checks the envelope, the version, every id, every date (rejecting things like `2026-02-31`), tag references, and the shape of each counter and repeat. Any failure aborts the whole import with a path-qualified error (`tasks[3].dueDate`) and changes nothing. A snapshot of your previous data is kept so you can undo once.

## Known limits

- **Reminders need the tab open.** No service worker, no background push — that's a deliberate constraint, not an oversight.
- **`localStorage` is per-origin.** `file://` and `github.io` are different origins, so data does not follow you. Export, then import on the other side.
- **No sync or accounts.** One browser, one dataset.
- **Notification permission can be permanently denied**; the in-app toast is the fallback, not an equivalent.
- **Import replaces, it never merges** — merging would need conflict rules for ids and repeat series.
- **GitHub Pages caches HTML for a few minutes.** Hard-refresh after deploying an update.

## Manual test checklist

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
