import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { BUCKET_MS, formatTick, indexAt, niceMax, selectionToRange } from "../chart";
import { formatNumber } from "../format";
import { useHistogram, useSlow } from "../hooks";
import type { ViewState } from "../types";
import { ErrorState } from "./States";

const HEIGHT = 168;
const MARGIN = { top: 10, right: 12, bottom: 24, left: 44 };

interface Props {
  view: ViewState;
  onSelect: (from: string, to: string) => void;
  onClear: () => void;
}

interface Selection {
  anchor: number;
  head: number;
}

export function Chart({ view, onSelect, onClear }: Props) {
  const { points, bucket, loading, error, retry } = useHistogram(view);
  const slow = useSlow(loading);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(320, el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setSelection(null);
    setCursor(null);
    setHover(null);
  }, [points]);

  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const max = niceMax(Math.max(1, ...points.map((p) => p.count)));
  const barW = points.length ? innerW / points.length : 0;
  const total = points.reduce((sum, p) => sum + p.count, 0);
  const ranged = !!view.from;
  const span = points.length ? points[points.length - 1].t + BUCKET_MS[bucket] - points[0].t : 0;
  const withDate = span > 24 * 3_600_000;

  const xOf = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    return clientX - rect.left;
  };
  const indexFromEvent = (e: PointerEvent) => indexAt(xOf(e.clientX), MARGIN.left, innerW, points.length);

  const apply = (sel: Selection) => {
    const range = selectionToRange(points, sel.anchor, sel.head, bucket);
    if (range) onSelect(range.from, range.to);
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || points.length === 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    const i = indexFromEvent(e);
    setSelection({ anchor: i, head: i });
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    const i = indexFromEvent(e);
    setHover(i);
    if (dragging.current) setSelection((s) => (s ? { ...s, head: i } : s));
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    const i = indexFromEvent(e);
    if (selection) apply({ anchor: selection.anchor, head: i });
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    const last = points.length - 1;
    const current = cursor ?? last;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowRight": {
        const next = Math.max(0, Math.min(last, current + (e.key === "ArrowLeft" ? -1 : 1)));
        setCursor(next);
        setHover(next);
        setSelection((s) => (e.shiftKey ? { anchor: s?.anchor ?? current, head: next } : null));
        break;
      }
      case "Home":
        setCursor(0);
        setHover(0);
        break;
      case "End":
        setCursor(last);
        setHover(last);
        break;
      case "Enter":
      case " ":
        apply(selection ?? { anchor: current, head: current });
        break;
      case "Escape":
        if (!selection) return;
        setSelection(null);
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const tickCount = Math.min(6, points.length);
  const ticks = Array.from({ length: tickCount }, (_, i) =>
    tickCount === 1 ? 0 : Math.round((i * (points.length - 1)) / (tickCount - 1)),
  );

  const lo = selection ? Math.min(selection.anchor, selection.head) : -1;
  const hi = selection ? Math.max(selection.anchor, selection.head) : -1;
  const selectedCount = selection
    ? points.slice(lo, hi + 1).reduce((sum, p) => sum + p.count, 0)
    : 0;
  const hovered = hover !== null ? points[hover] : null;

  const summary = loading
    ? "Loading chart"
    : points.length
      ? `Events over time: ${formatNumber(total)} events in ${points.length} ${bucket} buckets from ${formatTick(points[0].t, true)} to ${formatTick(points[points.length - 1].t + BUCKET_MS[bucket], true)} UTC`
      : "No events to chart";

  return (
    <section className="chart-card" aria-label="Events over time">
      <header className="chart-head">
        <div>
          <h2>Events over time</h2>
          <p className="muted">
            {ranged ? "Zoomed to the selected range · " : ""}
            {bucket === "1h" ? "Hourly" : bucket === "5m" ? "5-minute" : "1-minute"} buckets (UTC). Drag across the chart to filter the list.
          </p>
        </div>
        <div className="chart-actions">
          {selection && (
            <span className="chart-selection" role="status">
              {formatNumber(selectedCount)} events selected
            </span>
          )}
          {ranged && (
            <button className="btn ghost" onClick={onClear}>
              Reset range
            </button>
          )}
        </div>
      </header>

      <div className="chart-box" ref={box} style={{ height: HEIGHT }}>
        {error && <ErrorState error={error} onRetry={retry} title="Couldn't load the chart" />}

        {!error && loading && points.length === 0 && (
          <div className="chart-loading" role="status">
            {slow ? "The chart is taking longer than usual…" : "Loading chart…"}
          </div>
        )}

        {!error && !loading && points.length === 0 && (
          <div className="chart-loading">No events in this range.</div>
        )}

        {!error && points.length > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            className={`chart-svg${loading ? " is-loading" : ""}`}
            tabIndex={0}
            role="group"
            aria-label={summary}
            aria-describedby="chart-help"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => !dragging.current && setHover(null)}
            onBlur={() => setCursor(null)}
            onKeyDown={onKeyDown}
          >
            <defs>
              <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: "var(--bar-top)" }} />
                <stop offset="100%" style={{ stopColor: "var(--bar-bottom)" }} />
              </linearGradient>
            </defs>

            {[0, 0.5, 1].map((f) => {
              const y = MARGIN.top + innerH - f * innerH;
              return (
                <g key={f}>
                  <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y} y2={y} className="chart-grid" />
                  <text x={MARGIN.left - 8} y={y + 4} textAnchor="end" className="chart-axis">
                    {formatNumber(Math.round(max * f))}
                  </text>
                </g>
              );
            })}

            {points.map((p, i) => {
              const h = (p.count / max) * innerH;
              const gap = barW > 6 ? 1.5 : barW > 3 ? 1 : 0;
              return (
                <rect
                  key={p.t}
                  x={MARGIN.left + i * barW + gap / 2}
                  y={MARGIN.top + innerH - h}
                  width={Math.max(1, barW - gap)}
                  height={h}
                  rx={barW > 8 ? 2 : 0}
                  className={`chart-bar${hover === i ? " hot" : ""}`}
                  fill="url(#bar-grad)"
                />
              );
            })}

            {selection && (
              <rect
                x={MARGIN.left + lo * barW}
                y={MARGIN.top}
                width={(hi - lo + 1) * barW}
                height={innerH}
                className="chart-brush"
              />
            )}

            {cursor !== null && (
              <rect
                x={MARGIN.left + cursor * barW}
                y={MARGIN.top}
                width={Math.max(2, barW)}
                height={innerH}
                className="chart-cursor"
              />
            )}

            {ticks.map((i) => (
              <text
                key={i}
                x={MARGIN.left + i * barW + barW / 2}
                y={HEIGHT - 6}
                textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                className="chart-axis"
              >
                {formatTick(points[i].t, withDate)}
              </text>
            ))}
          </svg>
        )}

        {hovered && (
          <div
            className="chart-tip"
            style={{
              left: Math.min(width - 150, Math.max(8, MARGIN.left + (hover as number) * barW - 60)),
            }}
            aria-hidden="true"
          >
            <strong>{formatNumber(hovered.count)}</strong> events
            <span>{formatTick(hovered.t, true)} UTC</span>
          </div>
        )}
      </div>

      <p id="chart-help" className="chart-help muted">
        Keyboard: focus the chart, use Left/Right to move, hold Shift to extend, Enter to apply the range.
      </p>
    </section>
  );
}
