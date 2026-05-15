import { describe, it, expect, beforeEach, vi } from "vitest";
import { runTask, __resetRunnerState } from "./runner";

describe("runTask", () => {
  beforeEach(() => {
    __resetRunnerState();
    vi.restoreAllMocks();
  });

  it("runs the task and logs duration on success", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const fn = vi.fn().mockResolvedValue(undefined);

    await runTask("snapshot", fn);

    expect(fn).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("[scheduler] snapshot done in"),
    );
  });

  it("catches errors and logs them without throwing", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const fn = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(runTask("snapshot", fn)).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("[scheduler] snapshot failed"),
      expect.any(Error),
    );
  });

  it("skips overlapping invocations of the same task", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let release!: () => void;
    const slow = vi.fn().mockImplementation(
      () => new Promise<void>((r) => { release = r; }),
    );

    const first = runTask("snapshot", slow);
    await runTask("snapshot", slow); // second call while first in-flight

    expect(slow).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[scheduler] snapshot already running"),
    );

    release();
    await first;
  });

  it("allows different task names to run concurrently", async () => {
    let releaseA!: () => void;
    const slowA = vi.fn().mockImplementation(
      () => new Promise<void>((r) => { releaseA = r; }),
    );
    const fastB = vi.fn().mockResolvedValue(undefined);

    const a = runTask("a", slowA);
    await runTask("b", fastB);
    expect(fastB).toHaveBeenCalledOnce();

    releaseA();
    await a;
  });
});
