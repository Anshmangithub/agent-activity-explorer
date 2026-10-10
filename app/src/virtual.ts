export interface Range {
  start: number;
  end: number;
}

export function visibleRange(scrollTop: number, viewport: number, rowHeight: number, count: number, overscan = 8): Range {
  if (count <= 0 || viewport <= 0) return { start: 0, end: 0 };
  const first = Math.floor(scrollTop / rowHeight);
  const last = Math.ceil((scrollTop + viewport) / rowHeight);
  return {
    start: Math.max(0, first - overscan),
    end: Math.min(count, last + overscan),
  };
}

export function scrollToReveal(index: number, scrollTop: number, viewport: number, rowHeight: number): number {
  const top = index * rowHeight;
  const bottom = top + rowHeight;
  if (top < scrollTop) return top;
  if (bottom > scrollTop + viewport) return bottom - viewport;
  return scrollTop;
}
