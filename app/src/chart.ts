import type { HistogramBucket } from "./types";

export const BUCKET_MS = { "1m": 60_000, "5m": 300_000, "1h": 3_600_000 } as const;
export type Bucket = keyof typeof BUCKET_MS;

const HOUR = 3_600_000;
const MAX_POINTS = 2000;

export interface Point {
  t: number;
  count: number;
}

export function chooseBucket(fromMs: number | null, toMs: number | null): Bucket {
  if (fromMs === null || toMs === null) return "1h";
  const span = toMs - fromMs;
  if (span <= 3 * HOUR) return "1m";
  if (span <= 30 * HOUR) return "5m";
  return "1h";
}

export function fillBuckets(
  buckets: HistogramBucket[],
  bucket: Bucket,
  fromMs: number | null,
  toMs: number | null,
): Point[] {
  const step = BUCKET_MS[bucket];
  const counts = new Map(buckets.map((b) => [Date.parse(b.t), b.count]));
  const times = [...counts.keys()];
  if (fromMs === null && times.length === 0) return [];
  const first = fromMs ?? Math.min(...times);
  const last = toMs ?? Math.max(...times) + step;
  const start = Math.floor(first / step) * step;
  const points: Point[] = [];
  for (let t = start; t < last && points.length < MAX_POINTS; t += step) {
    points.push({ t, count: counts.get(t) ?? 0 });
  }
  return points;
}

export function niceMax(value: number): number {
  if (value <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

export function selectionToRange(points: Point[], a: number, b: number, bucket: Bucket) {
  if (points.length === 0) return null;
  const lo = Math.max(0, Math.min(a, b, points.length - 1));
  const hi = Math.min(points.length - 1, Math.max(a, b, 0));
  return {
    from: new Date(points[lo].t).toISOString(),
    to: new Date(points[hi].t + BUCKET_MS[bucket]).toISOString(),
  };
}

export function indexAt(x: number, left: number, width: number, count: number): number {
  if (count === 0 || width <= 0) return 0;
  const i = Math.floor(((x - left) / width) * count);
  return Math.max(0, Math.min(count - 1, i));
}

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatTick(ms: number, withDate: boolean): string {
  const d = new Date(ms);
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return withDate ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${time}` : time;
}
