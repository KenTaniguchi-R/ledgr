import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getSchedulerConfig } from "./config";

const KEYS = [
  "SCHEDULER_ENABLED",
  "SCHEDULER_SNAPSHOT_CRON",
  "SCHEDULER_SAFETY_SYNC_CRON",
];

describe("getSchedulerConfig", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("returns defaults when nothing is set", () => {
    expect(getSchedulerConfig()).toEqual({
      enabled: true,
      snapshotCron: "15 3 * * *",
      safetySyncCron: "30 4 * * *",
    });
  });

  it("respects SCHEDULER_ENABLED=false", () => {
    process.env.SCHEDULER_ENABLED = "false";
    expect(getSchedulerConfig().enabled).toBe(false);
  });

  it("treats SCHEDULER_ENABLED=0 as false", () => {
    process.env.SCHEDULER_ENABLED = "0";
    expect(getSchedulerConfig().enabled).toBe(false);
  });

  it("uses overridden cron expressions", () => {
    process.env.SCHEDULER_SNAPSHOT_CRON = "0 2 * * *";
    process.env.SCHEDULER_SAFETY_SYNC_CRON = "0 5 * * *";
    const cfg = getSchedulerConfig();
    expect(cfg.snapshotCron).toBe("0 2 * * *");
    expect(cfg.safetySyncCron).toBe("0 5 * * *");
  });

  it("rejects an invalid cron expression with a clear error", () => {
    process.env.SCHEDULER_SNAPSHOT_CRON = "not a cron";
    expect(() => getSchedulerConfig()).toThrow(/SCHEDULER_SNAPSHOT_CRON/);
  });
});
