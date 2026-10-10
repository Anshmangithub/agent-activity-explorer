import { useEffect, useMemo, useRef, useState } from "react";
import { useEventDetail, useSlow } from "../hooks";
import { formatLatency, formatNumber, formatTime } from "../format";
import { EmptyState, ErrorState, LoadingHint, SkeletonRows } from "./States";

const PREVIEW_CHARS = 20_000;

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const text = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2) ?? "undefined";
    } catch {
      return String(value);
    }
  }, [value]);
  const truncated = !expanded && text.length > PREVIEW_CHARS;
  return (
    <section className="json-section">
      <h3>{label}</h3>
      <pre tabIndex={0} aria-label={`${label} (JSON)`}>{truncated ? text.slice(0, PREVIEW_CHARS) : text}</pre>
      {truncated && (
        <p className="muted">
          Showing the first {formatNumber(PREVIEW_CHARS)} of {formatNumber(text.length)} characters.{" "}
          <button className="link" onClick={() => setExpanded(true)}>Show everything</button>
        </p>
      )}
    </section>
  );
}

export function DetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, loading, error, retry } = useEventDetail(id);
  const slow = useSlow(loading);
  const panel = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, [id]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {

    }
  };

  return (
    <aside ref={panel} className="panel" role="dialog" aria-modal="false" aria-labelledby="panel-title" tabIndex={-1}>
      <header className="panel-head">
        <div>
          <h2 id="panel-title">Event details</h2>
          <p className="mono muted id">{id}</p>
        </div>
        <div className="panel-actions">
          <button className="btn ghost" onClick={copyLink}>{copied ? "Copied" : "Copy link"}</button>
          <button className="btn ghost" onClick={onClose} aria-label="Close details (Esc)">✕</button>
        </div>
      </header>

      <div className="panel-body">
        {loading && (
          <>
            <LoadingHint label="Loading event" slow={slow} />
            <SkeletonRows count={6} />
          </>
        )}
        {error?.notFound && (
          <EmptyState title="Event not found">
            <p>No event with this id exists. The link may be wrong or the event may have been removed.</p>
            <button className="btn" onClick={onClose}>Close</button>
          </EmptyState>
        )}
        {error && !error.notFound && <ErrorState error={error} onRetry={retry} title="Couldn't load this event" />}
        {data && (
          <>
            <dl className="meta">
              <dt>Timestamp</dt><dd className="mono">{formatTime(data.timestamp)} UTC</dd>
              <dt>Agent</dt><dd>{data.agent}</dd>
              <dt>Tool</dt><dd className="mono">{data.tool}</dd>
              <dt>Status</dt><dd><span className={`badge ${data.status}`}>{data.status}</span></dd>
              <dt>Latency</dt><dd className="mono">{formatLatency(data.latencyMs)}</dd>
            </dl>
            <section>
              <h3>Policy matches</h3>
              {data.policyMatches.length ? (
                <ul className="tags">{data.policyMatches.map((p) => <li key={p}>{p}</li>)}</ul>
              ) : (
                <p className="muted">No policy rules fired.</p>
              )}
            </section>
            <JsonBlock label="Arguments" value={data.args} />
            <JsonBlock label="Result" value={data.result} />
          </>
        )}
      </div>
    </aside>
  );
}
