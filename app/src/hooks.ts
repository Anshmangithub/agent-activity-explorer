import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ApiError, fetchAgents, fetchEvent, fetchEvents, fetchHistogram, isAbort, streamUrl } from "./api";
import { chooseBucket, fillBuckets, type Bucket, type Point } from "./chart";
import type { EventDetail, EventItem, ViewState } from "./types";
import { matchesView, parseView, serializeView } from "./url";

const URL_EVENT = "urlchange";

function subscribe(cb: () => void) {
  window.addEventListener("popstate", cb);
  window.addEventListener(URL_EVENT, cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener(URL_EVENT, cb);
  };
}
const getSearch = () => window.location.search;

export function useView() {
  const search = useSyncExternalStore(subscribe, getSearch);
  const view = useMemo(() => parseView(search), [search]);

  const update = useCallback((patch: Partial<ViewState>, mode: "push" | "replace" = "push") => {
    const next = serializeView({ ...parseView(window.location.search), ...patch });
    if (next === serializeView(parseView(window.location.search))) return;
    const url = window.location.pathname + (next ? `?${next}` : "");
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event(URL_EVENT));
  }, []);

  return [view, update] as const;
}

export function useSlow(active: boolean, ms = 2500) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!active) return;
    const t = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return slow;
}

export function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export interface EventsState {
  items: EventItem[];
  total: number | null;
  nextCursor: string | null;

  loading: boolean;
  error: ApiError | null;

  loadingMore: boolean;
  moreError: ApiError | null;
}

const INITIAL: EventsState = {
  items: [],
  total: null,
  nextCursor: null,
  loading: true,
  error: null,
  loadingMore: false,
  moreError: null,
};

const asApiError = (e: unknown) => (e instanceof ApiError ? e : new ApiError("Something went wrong."));

export function useEvents(view: ViewState) {
  const { q, status, from, to } = view;
  const agentsKey = view.agents.join("\n");
  const [state, setState] = useState<EventsState>(INITIAL);
  const [reloadToken, setReloadToken] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const inFlight = useRef<AbortController | null>(null);
  const queryRef = useRef(view);
  queryRef.current = view;

  useEffect(() => {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    setState(INITIAL);
    fetchEvents(queryRef.current, null, ctrl.signal).then(
      (page) =>
        setState({ ...INITIAL, loading: false, items: page.items, total: page.total, nextCursor: page.nextCursor }),
      (err) => {
        if (!isAbort(err)) setState({ ...INITIAL, loading: false, error: asApiError(err) });
      },
    );
    return () => ctrl.abort();
  }, [q, status, from, to, agentsKey, reloadToken]);

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (s.loading || s.loadingMore || !s.nextCursor || s.error) return;
    const ctrl = new AbortController();
    inFlight.current?.abort();
    inFlight.current = ctrl;
    setState((p) => ({ ...p, loadingMore: true, moreError: null }));
    fetchEvents(queryRef.current, s.nextCursor, ctrl.signal).then(
      (page) =>
        setState((p) => {
          const seen = new Set(p.items.map((i) => i.id));
          return {
            ...p,
            loadingMore: false,
            items: [...p.items, ...page.items.filter((i) => !seen.has(i.id))],
            total: page.total,
            nextCursor: page.nextCursor,
          };
        }),
      (err) => {
        if (!isAbort(err)) setState((p) => ({ ...p, loadingMore: false, moreError: asApiError(err) }));
      },
    );
  }, []);

  const prepend = useCallback((incoming: EventItem[]) => {
    if (incoming.length === 0) return;
    setState((p) => {
      const seen = new Set(p.items.map((i) => i.id));
      const fresh = incoming.filter((i) => !seen.has(i.id));
      if (fresh.length === 0) return p;
      return { ...p, items: [...fresh, ...p.items], total: p.total === null ? p.total : p.total + fresh.length };
    });
  }, []);

  const retry = useCallback(() => setReloadToken((n) => n + 1), []);
  return { ...state, loadMore, prepend, retry };
}

export function useEventDetail(id: string) {
  const [state, setState] = useState<{ data: EventDetail | null; loading: boolean; error: ApiError | null }>({
    data: null,
    loading: !!id,
    error: null,
  });
  const [token, setToken] = useState(0);

  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();
    setState({ data: null, loading: true, error: null });
    fetchEvent(id, ctrl.signal).then(
      (data) => setState({ data, loading: false, error: null }),
      (err) => {
        if (!isAbort(err)) setState({ data: null, loading: false, error: asApiError(err) });
      },
    );
    return () => ctrl.abort();
  }, [id, token]);

  return { ...state, retry: () => setToken((n) => n + 1) };
}

export function useAgents() {
  const [state, setState] = useState<{ agents: string[]; loading: boolean; error: ApiError | null }>({
    agents: [],
    loading: true,
    error: null,
  });
  const [token, setToken] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    setState((p) => ({ ...p, loading: true, error: null }));
    fetchAgents(ctrl.signal).then(
      (agents) => setState({ agents, loading: false, error: null }),
      (err) => {
        if (!isAbort(err)) setState({ agents: [], loading: false, error: asApiError(err) });
      },
    );
    return () => ctrl.abort();
  }, [token]);
  return { ...state, retry: () => setToken((n) => n + 1) };
}

export function useHistogram(view: ViewState) {
  const { q, status, from, to } = view;
  const agentsKey = view.agents.join(",");
  const [state, setState] = useState<{
    points: Point[];
    bucket: Bucket;
    loading: boolean;
    error: ApiError | null;
  }>({ points: [], bucket: "1h", loading: true, error: null });
  const [token, setToken] = useState(0);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const ctrl = new AbortController();
    const current = viewRef.current;
    const fromMs = current.from ? Date.parse(current.from) : null;
    const toMs = current.to ? Date.parse(current.to) : null;
    const bucket = chooseBucket(fromMs, toMs);
    setState((p) => ({ ...p, loading: true, error: null }));
    fetchHistogram(current, bucket, ctrl.signal).then(
      (res) =>
        setState({
          points: fillBuckets(res.buckets, bucket, fromMs, toMs),
          bucket,
          loading: false,
          error: null,
        }),
      (err) => {
        if (!isAbort(err)) setState((p) => ({ ...p, loading: false, error: asApiError(err) }));
      },
    );
    return () => ctrl.abort();
  }, [q, status, from, to, agentsKey, token]);

  return { ...state, retry: () => setToken((n) => n + 1) };
}

export type LiveStatus = "off" | "connecting" | "live" | "reconnecting";

const MAX_BUFFER = 5000;

export function useLive(enabled: boolean, view: ViewState) {
  const [status, setStatus] = useState<LiveStatus>("off");
  const [pending, setPending] = useState(0);
  const buffer = useRef<EventItem[]>([]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const queryKey = serializeView({ ...view, event: "" });

  useEffect(() => {
    buffer.current = [];
    setPending(0);
    if (!enabled) {
      setStatus("off");
      return;
    }
    setStatus("connecting");
    const source = new EventSource(streamUrl());
    source.onopen = () => setStatus("live");
    source.onerror = () => setStatus("reconnecting");
    source.onmessage = (message) => {
      let event: EventItem;
      try {
        event = JSON.parse(message.data) as EventItem;
      } catch {
        return;
      }
      if (!matchesView(event, viewRef.current)) return;
      buffer.current.push(event);
      if (buffer.current.length > MAX_BUFFER) buffer.current.shift();
    };
    const timer = setInterval(() => setPending((n) => (n === buffer.current.length ? n : buffer.current.length)), 400);
    return () => {
      clearInterval(timer);
      source.close();
    };
  }, [enabled, queryKey]);

  const flush = useCallback(() => {
    const items = buffer.current.reverse();
    buffer.current = [];
    setPending(0);
    return items;
  }, []);

  return { status, pending, flush };
}
