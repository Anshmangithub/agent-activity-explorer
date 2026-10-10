# Perf Clinic: findings

All numbers come from the same scripted run in headless Chrome (Windows) with **4x CPU throttling** to mimic a mid-range laptop. "After" figures are from three runs of the final tree; where they varied I give the range. They use CDP `Performance.getMetrics` (`TaskDuration` = total main-thread time, `LayoutCount`, etc.) and a `PerformanceObserver` for FCP/LCP/CLS. Interactions: type "billing" one character at a time, scroll 40 steps, move the mouse 60 times over the list, resize the window 6 times, open and close the live ticker 6 times. "Before" is the untouched starter, "after" is the current tree. Absolute values are inflated by the throttle; the ratios are the point.

### 1. 100k-event search/sort/render blocks the first paint
- **Symptom:** a blank page for ~30 s (4x throttle) before anything shows.
- **How I found it:** Performance metrics plus the Performance panel. The load had 24 s of script time and DOMContentLoaded at 29.7 s. The time was dominated by `search()` called from the initial `renderResults('')`.
- **Root cause:** `search()` ran `JSON.stringify(event).toLowerCase()` on all 100,000 events, then sorted with `new Date(a) - new Date(b)`, which is ~1.7M Date allocations. It ran even for an empty query. `rememberViewed` also wrote an ever-growing JSON blob to localStorage once per row (200 times), using `Array.includes` per row. `fitSummaries` and `equalizeCardHeights` forced layouts (see #3 and #4). `theme.css` blocked rendering, and `config.js` generated all 100k events in one synchronous task.
- **Fix:** sort once with a string compare (the ISO timestamps are fixed width), short-circuit the empty query, build a lower-cased haystack lazily on the first real search, cache the last query, read localStorage once into a `Set` and write once per render, `defer` both scripts, and generate the dataset in chunks of 5,000 events that yield to the event loop (`ACTIVITY_READY` promise, same seed so the data is identical). The page paints first, the search box is disabled and the list says "Loading tool calls…" until the data is ready, and the agent cards show their call counts once it is.
- **Before / after:** DOMContentLoaded 29.7 s to 0.2-0.35 s, FCP 29.8 s to about 1.0-1.2 s, script time during load 24.0 s to about 0.2 s. The 100k events still take a few seconds of CPU at 4x to generate, but now in 5,000-event slices, so the page stays responsive while it fills in. I checked that the data is identical (100,000 events, same first row, same counts).

### 2. Scroll handler measures every row and scans the dataset
- **Symptom:** scrolling stutters badly and the topbar and progress bar lag.
- **How I found it:** Performance metrics showed 79 s of script time for 40 scroll steps. The forced-reflow pattern and the 100k-element filter are visible in the code of `onScroll`.
- **Root cause:** `onScroll` ran on every event (not passive, not throttled). It removed `in-focus` from all 200 rows and then called `getBoundingClientRect()` on each (a write/read interleave that forced a layout each time). It set `width` and `padding` (layout) and ran `ACTIVITY.filter(...new Date(...).toISOString())` over 100k events.
- **Fix:** one rAF-throttled, passive handler. It hit-tests with `elementFromPoint` instead of measuring rows, looks up per-minute counts in a Map built once, uses `transform: scaleX` for the progress bar, and toggles a class for the compact topbar instead of per-pixel padding.
- **Before / after:** main-thread time for the scroll run 86.9 s to 5-7 s, script time 79.2 s to about 0.8 s. (With the images re-encoded I had measured 2.9 s; the original 4 MB hero PNG and the avatar PNGs cost more to decode and lazy-load during the scroll.)

### 3. Every keystroke re-renders everything and thrashes layout
- **Symptom:** typing in the search box freezes the page.
- **How I found it:** the same metrics while typing. `LayoutCount` for 7 characters was 8,516.
- **Root cause:** no debounce, so every keystroke re-ran the full search (#1) and re-rendered 200 rows. `fitSummaries` then read `scrollWidth` and wrote `fontSize` in a loop per cell, forcing a synchronous layout per iteration.
- **Fix:** 150 ms debounce, the indexed search from #1, and removal of the font-fitting loop (CSS `text-overflow: ellipsis` was already there).
- **Before / after:** main-thread time 83.1 s to about 1.0 s (0.9-1.2 s), layouts 8,516 to 8.
- **Tradeoff:** summaries are now truncated with an ellipsis instead of shrinking to 11 px.

### 4. Card height equalizing runs O(n²) layout on every image load and resize
- **Symptom:** resizing the window is very janky, and the agent grid jumps as avatars load.
- **How I found it:** layout counts during the resize run: 7,230 layouts over 6 resize steps. `equalizeCardHeights` is the only code on that path that touches layout.
- **Root cause:** for each of 24 cards it reset `style.height`, read `offsetTop`/`offsetHeight`, and looped over all cards again, interleaving writes and reads. It also ran on each of the 12 image loads.
- **Fix:** deleted the JS. The grid now uses `align-items: stretch` plus `min-height: 220px`, which does the same thing in one layout.
- **Before / after:** resize run 50.6 s to about 1.7 s, layouts 7,230 to 12.

### 5. Render-blocking CSS, duplicate and unhinted images
- **Symptom:** slow load on a real network, and a heavy page.
- **How I found it:** transferred bytes during load (6.5 MB), then checking file sizes, which CSS was used, and which image files were identical.
- **Root cause:** `theme.css` was 327 KB of utility classes and none of its 1,439 selectors was used (I checked with a script), yet it blocked rendering. The 12 avatar files are only 6 unique images (identical bytes in pairs), so the page downloaded each twice. The font had no `font-display` or preload, the images had no intrinsic size, and all avatars loaded eagerly although they sit below the fold.
- **Fix:** deleted `theme.css`, pointed the 12 cards at the 6 unique avatars (index % 6), preloaded the font and hero, added `font-display: swap`, `width`/`height` on images, `loading="lazy"` and `decoding="async"` on avatars. I did not re-encode or add any image files; the original PNGs are untouched.
- **Before / after:** transferred bytes 6,468 KB to 5,204 KB; 327 KB of blocking CSS removed; 7 image requests instead of 13.

### 6. Hover preview linear-scans 100k events on every mousemove
- **Symptom:** the row tooltip lags behind the cursor.
- **How I found it:** script time during 60 mouse moves, and reading `showPreview`.
- **Root cause:** `ACTIVITY.find(...)` per `mousemove`, plus setting `top`/`left` (layout) each time.
- **Fix:** a `Map` lookup by id, one update per animation frame, DOM text only updated when the row changes, and positioning via `transform`.
- **Before / after:** script time 6.7 s to about 0.1 s (total main-thread time for the run 10.4 s to about 3 s; the remainder is mostly browser style recalcs from the synthetic mouse moves).

### 7. Live ticker leaks timers, listeners and DOM
- **Symptom:** after toggling "Show live calls" a few times the page gets slower, even with the panel closed.
- **How I found it:** `Memory.getDOMCounters` and idle main-thread time after 6 open/close cycles.
- **Root cause:** `openTicker` created a `setInterval` that was never cleared, and added `resize` and `keydown` listeners every time. A `Map` cached every rendered row forever and each tick used `cloneNode`. Closing only removed the panel element, so 6 timers kept prepending into a detached list.
- **Fix:** store and clear the interval, register and remove the listeners with the panel, drop the cache.
- **Before / after:** listeners added over 6 cycles 7 to 0, nodes retained 1,423 to -2, idle main-thread time with the panel closed 2.6 s per 2 s to 2 ms per 2 s.

### 8. Alert marquee animates `left`
- **Symptom:** constant background layout work, plus an animation that ignores `prefers-reduced-motion`.
- **How I found it:** reading the CSS: `@keyframes` animated `left` on an absolutely positioned element.
- **Root cause:** animating `left` triggers layout on every frame.
- **Fix:** animate `transform: translateX` (compositor only) and disable the animation under `prefers-reduced-motion`.
- **Before / after:** not isolated as a separate metric, so I have no number for it. It is a small part of the idle costs above.

### 9. Layout shift when the agent grid and results list fill in
- **Symptom:** a small layout shift (CLS 0.0348, reported on `section.section`) in Chrome DevTools' Performance panel.
- **How I found it:** the Layout shifts tab of DevTools' live metrics. I could not reproduce it in my headless runs (CLS 0 to 0.0003 at 1280px and 940px wide, with and without throttling), so I have **no before/after measurement** for this fix.
- **Root cause (likely, not confirmed):** `#agents` and `#results` are empty in the HTML and get filled by `app.js`, so content below them moves down when they render.
- **Fix:** reserve space with `min-height` (236px on `.agent-grid`, 480px on `.results`). This is a partial reserve: it removes the shift for the first row of cards and the results list, but the grid can still grow past one row.
- **Before / after:** CLS 0.0348 before (your DevTools reading). I have not re-measured after the change.

### Remaining
- The hero image is still the original 4.17 MB PNG (and the avatars ~160 KB each). I kept the original image files on purpose, so the only image savings are the code-level ones in #5. Re-encoding or resizing them is the next win and would cut transferred bytes by about 90%.
- Memory: heap is back to about 30 MB (27.6 MB originally, 56.4 MB in an earlier version of my fix that cached a lower-cased copy of every event; I dropped that cache and match on the fly instead).

### Behaviour changes
- Search matches field values only. Before, it matched the JSON text including keys, so searching "status" matched every event.
- Summaries are truncated with an ellipsis instead of shrinking their font to 11 px.
- The search box is disabled for the first moments while the dataset is generated.
