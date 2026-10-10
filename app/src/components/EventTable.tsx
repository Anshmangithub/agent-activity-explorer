import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { EventsState } from "../hooks";
import { formatLatency, formatNumber, formatTime } from "../format";
import { scrollToReveal, visibleRange } from "../virtual";

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 36;

const PREFETCH_ROWS = 25;

interface Props {
  state: EventsState;
  selectedId: string;
  onOpen: (id: string) => void;
  onLoadMore: () => void;
  onAtTopChange: (atTop: boolean) => void;
}

const rowDomId = (id: string) => `row-${id}`;
const latencyLevel = (ms: number) => (ms < 300 ? "fast" : ms < 1500 ? "mid" : "slow");

export function EventTable({ state, selectedId, onOpen, onLoadMore, onAtTopChange }: Props) {
  const { items, nextCursor, loadingMore, moreError, total } = state;
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [active, setActive] = useState(0);

  const rowCount = items.length + 1;
  const bodyViewport = Math.max(0, viewport - HEADER_HEIGHT);
  const { start, end } = visibleRange(scrollTop, bodyViewport, ROW_HEIGHT, rowCount);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setViewport(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const atTop = scrollTop < 8 && active === 0;
  useEffect(() => {
    onAtTopChange(atTop);
  }, [atTop, onAtTopChange]);

  const first = items[0]?.id;
  useEffect(() => {
    setActive(0);
    setScrollTop(0);
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [first]);

  useEffect(() => {
    if (nextCursor && !loadingMore && !moreError && end >= items.length - PREFETCH_ROWS) onLoadMore();
  }, [end, items.length, nextCursor, loadingMore, moreError, onLoadMore]);

  const reveal = (index: number) => {
    const el = scroller.current;
    if (!el) return;
    const next = scrollToReveal(index, el.scrollTop, bodyViewport, ROW_HEIGHT);
    if (next !== el.scrollTop) el.scrollTop = next;
  };
  const moveTo = (index: number) => {
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    setActive(clamped);
    reveal(clamped);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || items.length === 0) return;
    const page = Math.max(1, Math.floor(bodyViewport / ROW_HEIGHT) - 1);
    switch (e.key) {
      case "ArrowDown": moveTo(active + 1); break;
      case "ArrowUp": moveTo(active - 1); break;
      case "PageDown": moveTo(active + page); break;
      case "PageUp": moveTo(active - page); break;
      case "Home": moveTo(0); break;
      case "End": moveTo(items.length - 1); break;
      case "Enter":
      case " ": {
        const item = items[active];
        if (item) onOpen(item.id);
        break;
      }
      default: return;
    }
    e.preventDefault();
  };

  const activeItem = items[Math.min(active, items.length - 1)];

  return (
    <div
      id="event-grid"
      ref={scroller}
      className="grid"
      role="grid"
      aria-label="Events"
      aria-rowcount={(total ?? items.length) + 1}
      aria-colcount={5}
      aria-busy={loadingMore}
      tabIndex={0}
      aria-activedescendant={activeItem ? rowDomId(activeItem.id) : undefined}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onKeyDown={onKeyDown}
    >
      <div className="grid-row grid-head" role="row" aria-rowindex={1} style={{ height: HEADER_HEIGHT }}>
        <div role="columnheader" aria-colindex={1}>Timestamp (UTC)</div>
        <div role="columnheader" aria-colindex={2}>Agent</div>
        <div role="columnheader" aria-colindex={3}>Tool</div>
        <div role="columnheader" aria-colindex={4}>Status</div>
        <div role="columnheader" aria-colindex={5} className="num">Latency</div>
      </div>

      <div className="grid-body" role="rowgroup" style={{ height: rowCount * ROW_HEIGHT }}>
        {items.slice(start, Math.min(end, items.length)).map((ev, offset) => {
          const i = start + offset;
          return (
            <div
              key={ev.id}
              id={rowDomId(ev.id)}
              className={`grid-row data-row${ev.id === selectedId ? " selected" : ""}${i === active ? " active" : ""}`}
              role="row"
              aria-rowindex={i + 2}
              aria-selected={ev.id === selectedId}
              style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
              onClick={() => {
                setActive(i);
                onOpen(ev.id);
              }}
            >
              <div role="gridcell" aria-colindex={1} className="mono">{formatTime(ev.timestamp)}</div>
              <div role="gridcell" aria-colindex={2} className="ellipsis" title={ev.agent}>{ev.agent}</div>
              <div role="gridcell" aria-colindex={3} className="ellipsis mono" title={ev.tool}>{ev.tool}</div>
              <div role="gridcell" aria-colindex={4}><span className={`badge ${ev.status}`}>{ev.status}</span></div>
              <div role="gridcell" aria-colindex={5} className="lat">
                <span className={`lat-bar ${latencyLevel(ev.latencyMs)}`} aria-hidden="true">
                  <span style={{ width: `${Math.max(4, Math.min(100, (ev.latencyMs / 2000) * 100))}%` }} />
                </span>
                <span className="mono">{formatLatency(ev.latencyMs)}</span>
              </div>
            </div>
          );
        })}

        {end >= items.length && (
          <div
            className="grid-row footer-row"
            role="row"
            aria-rowindex={items.length + 2}
            style={{ top: items.length * ROW_HEIGHT, height: ROW_HEIGHT }}
          >
            <div role="gridcell" aria-colindex={1} className="footer-cell">
              {moreError ? (
                <span role="alert">
                  Couldn't load more events. <button className="link" onClick={onLoadMore}>Retry</button>
                </span>
              ) : loadingMore || nextCursor ? (
                <span role="status">Loading more events…</span>
              ) : (
                <span className="muted">End of results · {formatNumber(items.length)} events</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
