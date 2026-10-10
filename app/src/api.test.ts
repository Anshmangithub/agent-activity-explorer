import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, eventsQuery, getJson, histogramQuery, isAbort } from "./api";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("getJson", () => {
  it("retries transient 500s and then succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ error: "boom" }, 500)).mockResolvedValueOnce(json({ ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getJson("/x")).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget with a readable error", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ error: "internal server error" }, 500));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getJson("/x", { retries: 1 })).rejects.toMatchObject({ status: 500, message: "internal server error" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ error: "event not found" }, 404));
    vi.stubGlobal("fetch", fetchMock);
    const err = (await getJson("/x").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.notFound).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces aborts as AbortError, never as a failure", async () => {
    const ctrl = new AbortController();
    vi.stubGlobal("fetch", (_u: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("x", "AbortError")))),
    );
    const p = getJson("/x", { signal: ctrl.signal });
    ctrl.abort();
    expect(isAbort(await p.catch((e) => e))).toBe(true);
  });
});

describe("eventsQuery", () => {
  it("repeats agent and omits empty fields", () => {
    const q = new URLSearchParams(eventsQuery({ q: "", agents: ["a", "b"], status: "ok", from: "", to: "" }, "cur", 50));
    expect(q.getAll("agent")).toEqual(["a", "b"]);
    expect(q.get("status")).toBe("ok");
    expect(q.get("cursor")).toBe("cur");
    expect(q.has("q")).toBe(false);
    expect(q.get("limit")).toBe("50");
  });
});

describe("histogramQuery", () => {
  it("carries the same filters as the list plus the bucket", () => {
    const q = new URLSearchParams(
      histogramQuery({ q: "x", agents: ["a"], status: "error", from: "2026-10-09T10:00:00.000Z", to: "2026-10-09T11:00:00.000Z" }, "5m"),
    );
    expect(q.get("bucket")).toBe("5m");
    expect(q.get("q")).toBe("x");
    expect(q.getAll("agent")).toEqual(["a"]);
    expect(q.get("status")).toBe("error");
    expect(q.get("from")).toBe("2026-10-09T10:00:00.000Z");
    expect(q.get("to")).toBe("2026-10-09T11:00:00.000Z");
  });
  it("omits the range when not set", () => {
    const q = new URLSearchParams(histogramQuery({ q: "", agents: [], status: "", from: "", to: "" }, "1h"));
    expect(q.has("from")).toBe(false);
    expect(q.has("to")).toBe(false);
  });
});
