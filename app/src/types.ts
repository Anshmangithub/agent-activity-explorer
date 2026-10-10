export type Status = "ok" | "blocked" | "error";
export const STATUSES: Status[] = ["ok", "blocked", "error"];

export interface EventItem {
  id: string;
  timestamp: string;
  agent: string;
  tool: string;
  status: Status;
  latencyMs: number;
  argsPreview: string;
}

export interface EventsPage {
  items: EventItem[];
  nextCursor: string | null;
  total: number;
}

export interface EventDetail extends Omit<EventItem, "argsPreview"> {
  args: unknown;
  result: unknown;
  policyMatches: string[];
}

export interface ViewState {
  q: string;
  agents: string[];
  status: Status | "";
  from: string;
  to: string;
  event: string;
}

export interface HistogramBucket {
  t: string;
  count: number;
}

export interface Histogram {
  bucket: "1m" | "5m" | "1h";
  buckets: HistogramBucket[];
}
