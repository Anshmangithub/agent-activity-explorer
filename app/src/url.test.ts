import { describe, expect, it } from "vitest";
import type { EventItem } from "./types";
import { matchesView, parseView, sameQuery, serializeView } from "./url";

describe("url state", () => {
  it("round-trips a full view", () => {
    const view = { q: "refund & more", agents: ["data-analyst", "billing-assistant"], status: "error" as const, from: "2026-10-09T10:00:00.000Z", to: "2026-10-09T11:00:00.000Z", event: "evt_1" };
    const parsed = parseView("?" + serializeView(view));
    expect(parsed).toEqual({ ...view, agents: ["billing-assistant", "data-analyst"] });
  });

  it("serialises the empty view to an empty string", () => {
    expect(serializeView(parseView(""))).toBe("");
  });

  it("drops invalid status and duplicate/empty agents", () => {
    const v = parseView("?status=bogus&agent=a&agent=a&agent=");
    expect(v.status).toBe("");
    expect(v.agents).toEqual(["a"]);
  });

  it("gives the same URL regardless of agent order (stable history entries)", () => {
    expect(serializeView(parseView("?agent=b&agent=a"))).toBe(serializeView(parseView("?agent=a&agent=b")));
  });

  it("sameQuery ignores the open event", () => {
    expect(sameQuery(parseView("?q=x&event=1"), parseView("?q=x&event=2"))).toBe(true);
    expect(sameQuery(parseView("?q=x"), parseView("?q=y"))).toBe(false);
  });

  it("keeps a valid time range and drops a broken or inverted one", () => {
    expect(parseView("?from=2026-10-09T10:00:00Z&to=2026-10-09T11:00:00Z")).toMatchObject({
      from: "2026-10-09T10:00:00.000Z",
      to: "2026-10-09T11:00:00.000Z",
    });
    expect(parseView("?from=nope&to=2026-10-09T11:00:00Z")).toMatchObject({ from: "", to: "" });
    expect(parseView("?from=2026-10-09T12:00:00Z&to=2026-10-09T11:00:00Z")).toMatchObject({ from: "", to: "" });
  });

  it("treats a different range as a different query", () => {
    expect(sameQuery(parseView("?from=2026-10-09T10:00:00Z&to=2026-10-09T11:00:00Z"), parseView(""))).toBe(false);
  });
});

describe("matchesView (live stream filtering)", () => {
  const event: EventItem = {
    id: "evt_1",
    timestamp: "2026-10-09T10:30:00.000Z",
    agent: "billing-assistant",
    tool: "http.request",
    status: "error",
    latencyMs: 10,
    argsPreview: '{"url":"https://api.stripe.com/v1/refunds"}',
  };
  const view = parseView("");

  it("matches everything with no filters", () => {
    expect(matchesView(event, view)).toBe(true);
  });
  it("filters by status and agent", () => {
    expect(matchesView(event, { ...view, status: "ok" })).toBe(false);
    expect(matchesView(event, { ...view, status: "error" })).toBe(true);
    expect(matchesView(event, { ...view, agents: ["data-analyst"] })).toBe(false);
    expect(matchesView(event, { ...view, agents: ["data-analyst", "billing-assistant"] })).toBe(true);
  });
  it("searches agent, tool and args, case-insensitively", () => {
    expect(matchesView(event, { ...view, q: "STRIPE" })).toBe(true);
    expect(matchesView(event, { ...view, q: "http.req" })).toBe(true);
    expect(matchesView(event, { ...view, q: "nothing-like-this" })).toBe(false);
  });
  it("respects the time range, end exclusive", () => {
    const range = { ...view, from: "2026-10-09T10:00:00.000Z", to: "2026-10-09T10:30:00.000Z" };
    expect(matchesView(event, range)).toBe(false);
    expect(matchesView(event, { ...range, to: "2026-10-09T10:30:00.001Z" })).toBe(true);
    expect(matchesView(event, { ...range, from: "2026-10-09T10:31:00.000Z", to: "2026-10-09T11:00:00.000Z" })).toBe(false);
  });
});
