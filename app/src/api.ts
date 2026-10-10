import type { EventDetail, EventsPage, Histogram, ViewState } from "./types";

export const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
  get notFound() {
    return this.status === 404;
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

interface RequestOptions {
  signal?: AbortSignal;

  retries?: number;
  timeoutMs?: number;
}

export async function getJson<T>(
  path: string,
  { signal, retries = 2, timeoutMs = 15_000 }: RequestOptions = {},
): Promise<T> {
  let attempt = 0;
  for (;;) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    try {
      const res = await fetch(BASE + path, { signal: combined });
      if (res.ok) return (await res.json()) as T;
      let message = `Request failed (${res.status})`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {

      }
      throw new ApiError(message, res.status);
    } catch (err) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const transient =
        (err instanceof ApiError && err.status !== undefined && err.status >= 500) ||
        !(err instanceof ApiError);
      if (!transient || attempt >= retries) {
        if (err instanceof ApiError) throw err;
        throw new ApiError(
          timeout.signal.aborted
            ? "The server took too long to respond."
            : "Couldn't reach the server. Check your connection.",
        );
      }
      attempt++;
      await sleep(300 * 2 ** (attempt - 1), signal);
    } finally {
      clearTimeout(timer);
    }
  }
}

type QueryView = Pick<ViewState, "q" | "agents" | "status" | "from" | "to">;

function filterParams(view: QueryView) {
  const p = new URLSearchParams();
  if (view.q) p.set("q", view.q);
  for (const a of view.agents) p.append("agent", a);
  if (view.status) p.set("status", view.status);
  if (view.from && view.to) {
    p.set("from", view.from);
    p.set("to", view.to);
  }
  return p;
}

export function eventsQuery(view: QueryView, cursor?: string | null, limit = 100) {
  const p = filterParams(view);
  if (cursor) p.set("cursor", cursor);
  p.set("limit", String(limit));
  return p.toString();
}

export function histogramQuery(view: QueryView, bucket: string) {
  const p = filterParams(view);
  p.set("bucket", bucket);
  return p.toString();
}

export const fetchEvents = (view: ViewState, cursor: string | null, signal: AbortSignal) =>
  getJson<EventsPage>(`/events?${eventsQuery(view, cursor)}`, { signal });

export const fetchEvent = (id: string, signal: AbortSignal) =>
  getJson<EventDetail>(`/events/${encodeURIComponent(id)}`, { signal });

export const fetchHistogram = (view: QueryView, bucket: string, signal: AbortSignal) =>
  getJson<Histogram>(`/events/histogram?${histogramQuery(view, bucket)}`, { signal });

export const streamUrl = () => `${BASE}/stream`;

export const fetchAgents = (signal: AbortSignal) => getJson<string[]>("/agents", { signal });
