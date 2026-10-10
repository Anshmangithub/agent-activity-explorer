import { STATUSES, type EventItem, type Status, type ViewState } from "./types";

export const EMPTY_VIEW: ViewState = { q: "", agents: [], status: "", from: "", to: "", event: "" };

const validIso = (value: string | null) => {
  if (!value) return "";
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
};

export function parseView(search: string): ViewState {
  const p = new URLSearchParams(search);
  const status = p.get("status") ?? "";
  const from = validIso(p.get("from"));
  const to = validIso(p.get("to"));
  const ranged = from && to && Date.parse(from) < Date.parse(to);
  return {
    q: p.get("q") ?? "",
    agents: [...new Set(p.getAll("agent").filter(Boolean))].sort(),
    status: (STATUSES as string[]).includes(status) ? (status as Status) : "",
    from: ranged ? from : "",
    to: ranged ? to : "",
    event: p.get("event") ?? "",
  };
}

export function serializeView(view: ViewState): string {
  const p = new URLSearchParams();
  if (view.q) p.set("q", view.q);
  for (const a of [...view.agents].sort()) p.append("agent", a);
  if (view.status) p.set("status", view.status);
  if (view.from && view.to) {
    p.set("from", view.from);
    p.set("to", view.to);
  }
  if (view.event) p.set("event", view.event);
  return p.toString();
}

export const sameQuery = (a: ViewState, b: ViewState) =>
  a.q === b.q &&
  a.status === b.status &&
  a.from === b.from &&
  a.to === b.to &&
  a.agents.join(",") === b.agents.join(",");

export const hasActiveFilters = (view: ViewState) =>
  !!(view.q || view.status || view.agents.length || view.from);

export function matchesView(event: EventItem, view: ViewState): boolean {
  if (view.status && event.status !== view.status) return false;
  if (view.agents.length && !view.agents.includes(event.agent)) return false;
  if (view.from) {
    const t = Date.parse(event.timestamp);
    if (t < Date.parse(view.from) || t >= Date.parse(view.to)) return false;
  }
  if (view.q) {
    const needle = view.q.toLowerCase();
    const haystack = `${event.agent} ${event.tool} ${event.argsPreview}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}
