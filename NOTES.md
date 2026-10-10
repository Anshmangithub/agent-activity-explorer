# Notes

## What I built
- **Part A (`app/`, React + Vite + TypeScript).** I picked Vite because there is no server-rendering need and it is the lightest setup for a client-only tool over a separate API. The app has a virtualised event table, URL-driven search, filters and time range (`q`, `agent`, `status`, `from`, `to`, `event`), a detail panel, and loading, empty, error and slow-network states.
- **Part B (`perf-clinic/`, `PERF.md`).** Nine problems found, with measured before/after numbers where I could measure them.
- **Optional items:** *virtualised list, built by hand* (the whole dataset has to be reachable, and 50k rows would otherwise be heavy), *tests* for URL state, windowing math and the API client, *live mode*, an *events-over-time chart* with drag-to-filter, plus most of *Polish* (keyboard navigation, dark mode, `prefers-reduced-motion`, tablet layout, semantic grid roles, focus management).

## Design decisions
- The URL is the only source of truth for the view. Filter changes and opening an event use `pushState`, so back/forward work; the search box commits to the URL 350 ms after typing stops.
- The API fails randomly, so GETs retry 5xx and network errors twice with backoff, 4xx are never retried, and every in-flight request is aborted when the view changes (no stale results).
- Huge `args` render as a 20k-character preview with a "Show everything" button.
- **Chart:** hand-built SVG over `/events/histogram`, using the same search and filters as the list. Dragging (or Shift+Arrows then Enter on the focused chart) writes `from`/`to` to the URL, snapped to whole buckets (end exclusive). The chart then zooms to that range with finer buckets (1h, 5m, 1m); "Reset range" zooms back out. Empty buckets, which the API omits, are filled with zeros. I checked that the chart total equals the list total, and that a selection's count equals the filtered list's total.
- **Live mode:** an `EventSource` on `/stream`, which sends every event unfiltered, so the client applies the current search, filters and range itself. If you are at the top of the list (scroll 0, first row active), new events are added automatically. Otherwise nothing moves: a "N new events" pill appears, and clicking it adds them and jumps to the top. The browser reconnects by itself, and the toggle shows "Reconnecting…".

## Tradeoffs and what I'd do with more time
- Timestamps display in UTC only, so shared links look the same for everyone.
- The grid only knows about loaded rows (cursor pagination), so you can't jump to the end of 50k.
- Live mode keeps at most 5,000 unseen events and drops the oldest beyond that. The chart is not refreshed as live events arrive, only when the filters or range change.
- I'd add component tests with Testing Library.

## Known gaps
- I tested the UI with a scripted headless Chrome run (list, scroll loading, filters, back/forward, reload, deep links, Esc, keyboard open, 404 and empty states, chart drag and keyboard selection, live mode while scrolled down), but those scripts aren't in the repo. Only the logic tests (`npm test` in `app/`) are.
- The tablet layout, `prefers-reduced-motion` and a dropped stream connection were not exercised in a browser. A live mode with an active search or agent filter is covered by unit tests only.
- No screen-reader testing, and no contrast check beyond choosing the colours with contrast in mind.
- **Git history:** nothing is committed on top of the single starter commit. The assignment asks for commit-as-you-go history, so split the work into commits before submitting.

