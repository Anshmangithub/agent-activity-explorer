import { useCallback, useEffect, useRef, useState } from "react";
import { Chart } from "./components/Chart";
import { DetailPanel } from "./components/DetailPanel";
import { EventTable } from "./components/EventTable";
import { Filters } from "./components/Filters";
import { EmptyState, ErrorState, LoadingHint, SkeletonRows } from "./components/States";
import { formatNumber } from "./format";
import { useEvents, useLive, useSlow, useView } from "./hooks";
import { hasActiveFilters } from "./url";

const LIVE_LABEL = {
  off: "",
  connecting: "Connecting…",
  live: "Streaming",
  reconnecting: "Reconnecting…",
} as const;

export function App() {
  const [view, update] = useView();
  const events = useEvents(view);
  const slow = useSlow(events.loading);
  const hasFilters = hasActiveFilters(view);
  const [liveOn, setLiveOn] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const live = useLive(liveOn, view);
  const { prepend } = events;
  const { flush: flushLive } = live;

  const showNew = useCallback(() => prepend(flushLive()), [prepend, flushLive]);

  useEffect(() => {
    if (liveOn && atTop && live.pending > 0 && !events.loading && !events.error) showNew();
  }, [liveOn, atTop, live.pending, events.loading, events.error, showNew]);

  const hadPanel = useRef(false);
  useEffect(() => {
    if (hadPanel.current && !view.event) document.getElementById("event-grid")?.focus({ preventScroll: true });
    hadPanel.current = !!view.event;
  }, [view.event]);

  useEffect(() => {
    if (!view.event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") update({ event: "" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view.event, update]);

  const showTable = !events.loading && !events.error && events.items.length > 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <div>
            <h1>Agent Activity</h1>
            <p className="tagline">Every tool call, every agent</p>
          </div>
        </div>
        <div className="live">
          <button
            className={`live-toggle${liveOn ? " on" : ""}`}
            aria-pressed={liveOn}
            onClick={() => setLiveOn((v) => !v)}
          >
            <span className="live-dot" aria-hidden="true" />
            Live
          </button>
          <span className={`live-status status-${live.status}`} role="status">
            {LIVE_LABEL[live.status]}
          </span>
        </div>
        <div className="stats" aria-live="polite">
          {events.total !== null && !events.error && (
            <>
              <div className="stat">
                <span className="stat-value">{formatNumber(events.items.length)}</span>
                <span className="stat-label">Loaded</span>
              </div>
              <div className="stat">
                <span className="stat-value">{formatNumber(events.total)}</span>
                <span className="stat-label">{hasFilters ? "Matching" : "Total events"}</span>
              </div>
            </>
          )}
        </div>
      </header>

      <Filters view={view} onChange={(patch) => update(patch)} />

      <Chart
        view={view}
        onSelect={(from, to) => update({ from, to })}
        onClear={() => update({ from: "", to: "" })}
      />

      <div className={`workspace${view.event ? " with-panel" : ""}`}>
        <main className="list" aria-label="Event list">
          {events.loading && (
            <>
              <LoadingHint label="Loading events" slow={slow} />
              <SkeletonRows />
            </>
          )}
          {events.error && <ErrorState error={events.error} onRetry={events.retry} title="Couldn't load events" />}
          {!events.loading && !events.error && events.items.length === 0 && (
            <EmptyState title={hasFilters ? "No events match your search" : "No events yet"}>
              {hasFilters ? (
                <>
                  <p>Try a different search term or remove some filters.</p>
                  <button className="btn" onClick={() => update({ q: "", status: "", agents: [], from: "", to: "" })}>Clear search and filters</button>
                </>
              ) : (
                <p>Agent activity will appear here as it happens.</p>
              )}
            </EmptyState>
          )}
          {showTable && (
            <EventTable
              state={events}
              selectedId={view.event}
              onOpen={(id) => update({ event: id })}
              onLoadMore={events.loadMore}
              onAtTopChange={setAtTop}
            />
          )}
          <div className="new-pill-slot" role="status" aria-live="polite">
            {liveOn && !atTop && live.pending > 0 && (
              <button className="new-pill" onClick={showNew}>
                ↑ {formatNumber(live.pending)} new {live.pending === 1 ? "event" : "events"}
              </button>
            )}
          </div>
        </main>

        {view.event && <DetailPanel key={view.event} id={view.event} onClose={() => update({ event: "" })} />}
      </div>
    </div>
  );
}
