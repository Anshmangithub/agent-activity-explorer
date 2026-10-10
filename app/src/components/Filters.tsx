import { useEffect, useState } from "react";
import { useAgents, useDebounced } from "../hooks";
import { STATUSES, type ViewState } from "../types";
import { hasActiveFilters } from "../url";

interface Props {
  view: ViewState;
  onChange: (patch: Partial<ViewState>) => void;
}

function SearchBox({ value, onCommit }: { value: string; onCommit: (q: string) => void }) {
  const [draft, setDraft] = useState(value);
  const debounced = useDebounced(draft, 350);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (debounced.trim() !== value) onCommit(debounced.trim());

  }, [debounced]);

  return (
    <div className="field grow">
      <label htmlFor="q">Search</label>
      <input
        id="q"
        type="search"
        placeholder="Search agent, tool or arguments"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(draft.trim());
        }}
        autoComplete="off"
      />
    </div>
  );
}

export function Filters({ view, onChange }: Props) {
  const { agents, loading, error, retry } = useAgents();
  const hasFilters = hasActiveFilters(view);

  const options = [...new Set([...agents, ...view.agents])].sort();

  const toggleAgent = (a: string) =>
    onChange({ agents: view.agents.includes(a) ? view.agents.filter((x) => x !== a) : [...view.agents, a] });

  return (
    <section className="filters" aria-label="Search and filters">
      <div className="filter-row">
        <SearchBox value={view.q} onCommit={(q) => onChange({ q })} />
        <div className="segmented" role="radiogroup" aria-labelledby="status-label">
          <span id="status-label" className="legend">Status</span>
          <div className="seg-group">
          {(["", ...STATUSES] as const).map((s) => (
            <label key={s || "all"} className={`seg seg-${s || "all"}`}>
              <input
                type="radio"
                name="status"
                value={s}
                checked={view.status === s}
                onChange={() => onChange({ status: s })}
              />
              <span>{s || "All"}</span>
            </label>
          ))}
          </div>
        </div>
        <button className="btn ghost" disabled={!hasFilters} onClick={() => onChange({ q: "", status: "", agents: [], from: "", to: "" })}>
          Clear all
        </button>
      </div>

      <fieldset className="agents">
        <legend>Agents{view.agents.length ? ` (${view.agents.length} selected)` : ""}</legend>
        {loading && options.length === 0 && <span className="muted" role="status">Loading agents…</span>}
        {error && (
          <span className="muted" role="alert">
            Couldn't load the agent list.{" "}
            <button className="link" onClick={retry}>
              Retry
            </button>
          </span>
        )}
        {options.map((a) => (
          <button key={a} className="chip" aria-pressed={view.agents.includes(a)} onClick={() => toggleAgent(a)}>
            {a}
          </button>
        ))}
      </fieldset>
    </section>
  );
}
