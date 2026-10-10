import { describe, expect, it } from "vitest";
import { chooseBucket, fillBuckets, formatTick, indexAt, niceMax, selectionToRange } from "./chart";

const t = (iso: string) => Date.parse(iso);

describe("chooseBucket", () => {
  it("uses hourly buckets with no range", () => {
    expect(chooseBucket(null, null)).toBe("1h");
  });
  it("zooms to finer buckets as the range shrinks", () => {
    expect(chooseBucket(t("2026-10-09T10:00:00Z"), t("2026-10-09T12:00:00Z"))).toBe("1m");
    expect(chooseBucket(t("2026-10-09T00:00:00Z"), t("2026-10-09T12:00:00Z"))).toBe("5m");
    expect(chooseBucket(t("2026-10-07T00:00:00Z"), t("2026-10-09T12:00:00Z"))).toBe("1h");
  });
});

describe("fillBuckets", () => {
  it("fills the gaps the API omits with zeros", () => {
    const pts = fillBuckets(
      [
        { t: "2026-10-09T10:00:00Z", count: 4 },
        { t: "2026-10-09T10:03:00Z", count: 2 },
      ],
      "1m",
      null,
      null,
    );
    expect(pts.map((p) => p.count)).toEqual([4, 0, 0, 2]);
  });
  it("honours an explicit range, including trailing empty buckets", () => {
    const pts = fillBuckets([{ t: "2026-10-09T10:01:00Z", count: 7 }], "1m", t("2026-10-09T10:00:00Z"), t("2026-10-09T10:04:00Z"));
    expect(pts.map((p) => p.count)).toEqual([0, 7, 0, 0]);
  });
  it("is empty when there is nothing to show", () => {
    expect(fillBuckets([], "1h", null, null)).toEqual([]);
  });
});

describe("selection", () => {
  const points = [0, 1, 2, 3, 4].map((i) => ({ t: t("2026-10-09T10:00:00Z") + i * 3_600_000, count: i }));
  it("snaps to whole buckets, end-exclusive, in either drag direction", () => {
    const expected = { from: "2026-10-09T11:00:00.000Z", to: "2026-10-09T14:00:00.000Z" };
    expect(selectionToRange(points, 1, 3, "1h")).toEqual(expected);
    expect(selectionToRange(points, 3, 1, "1h")).toEqual(expected);
  });
  it("a single bucket selects exactly that bucket", () => {
    expect(selectionToRange(points, 2, 2, "1h")).toEqual({ from: "2026-10-09T12:00:00.000Z", to: "2026-10-09T13:00:00.000Z" });
  });
  it("maps x to a clamped bucket index", () => {
    expect(indexAt(50, 40, 100, 10)).toBe(1);
    expect(indexAt(-20, 40, 100, 10)).toBe(0);
    expect(indexAt(999, 40, 100, 10)).toBe(9);
  });
});

describe("axis helpers", () => {
  it("rounds the axis maximum up to a friendly number", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(37)).toBe(50);
    expect(niceMax(2703)).toBe(5000);
    expect(niceMax(100)).toBe(100);
  });
  it("formats UTC ticks", () => {
    expect(formatTick(t("2026-10-09T08:05:00Z"), false)).toBe("08:05");
    expect(formatTick(t("2026-10-09T08:05:00Z"), true)).toBe("Oct 9 08:05");
  });
});
