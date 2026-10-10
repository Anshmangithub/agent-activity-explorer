import { describe, expect, it } from "vitest";
import { scrollToReveal, visibleRange } from "./virtual";

describe("visibleRange", () => {
  it("covers the viewport plus overscan, clamped to the list", () => {
    expect(visibleRange(0, 400, 40, 1000, 5)).toEqual({ start: 0, end: 15 });
    expect(visibleRange(4000, 400, 40, 1000, 5)).toEqual({ start: 95, end: 115 });
    expect(visibleRange(39_900, 400, 40, 1000, 5)).toEqual({ start: 992, end: 1000 });
  });
  it("is empty without rows or viewport", () => {
    expect(visibleRange(0, 400, 40, 0)).toEqual({ start: 0, end: 0 });
    expect(visibleRange(0, 0, 40, 100)).toEqual({ start: 0, end: 0 });
  });
  it("mounts a bounded number of rows however large the list is", () => {
    const { start, end } = visibleRange(1_000_000, 600, 40, 50_000, 8);
    expect(end - start).toBeLessThan(40);
  });
});

describe("scrollToReveal", () => {
  it("does not move when the row is already visible", () => {
    expect(scrollToReveal(5, 0, 400, 40)).toBe(0);
  });
  it("scrolls up just enough", () => {
    expect(scrollToReveal(2, 200, 400, 40)).toBe(80);
  });
  it("scrolls down just enough", () => {
    expect(scrollToReveal(20, 0, 400, 40)).toBe(440);
  });
});
