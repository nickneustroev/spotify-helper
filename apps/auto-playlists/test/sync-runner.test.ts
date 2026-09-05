import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncRunner } from "../src/runtime/sync-runner.js";

describe("createSyncRunner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a single cycle immediately without waiting for the gap", async () => {
    const runner = createSyncRunner(60_000);

    const result = await runner("mode", async () => "done");

    expect(result).toBe("done");
  });

  it("resolves the finished cycle before the gap elapses", async () => {
    const runner = createSyncRunner(60_000);

    const promise = runner("mode", async () => "done");

    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).resolves.toBe("done");
  });

  it("starts the next queued cycle only after the gap following the previous cycle", async () => {
    const runner = createSyncRunner(60_000);
    const events: string[] = [];

    const first = runner("mode", async () => {
      events.push("first");
    });
    const second = runner("mode", async () => {
      events.push("second");
    });

    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toEqual(["first"]);

    await vi.advanceTimersByTimeAsync(59_999);
    expect(events).toEqual(["first"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(events).toEqual(["first", "second"]);

    await second;
  });

  it("keeps the queue working when a cycle fails", async () => {
    const runner = createSyncRunner(60_000);
    const second = vi.fn();

    const first = runner("mode", async () => {
      throw new Error("boom");
    });
    const queued = runner("mode", second);

    await expect(first).rejects.toThrow("boom");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(second).toHaveBeenCalledTimes(1);

    await queued;
  });
});
