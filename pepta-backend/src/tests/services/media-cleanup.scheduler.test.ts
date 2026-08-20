import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cronSchedule: vi.fn(),
  stop: vi.fn(),
  queueExpiredMedia: vi.fn(),
  runDueMediaCleanup: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("node-cron", () => ({
  default: { schedule: mocks.cronSchedule },
}));

vi.mock("../../config/env", () => ({
  env: {
    scheduler: {
      timezone: "America/New_York",
      mediaCleanupCron: "*/15 * * * *",
    },
  },
}));

vi.mock("../../lib/logger", () => ({
  logger: { info: mocks.info, warn: mocks.warn },
}));

vi.mock("../../services/media-cleanup.service", () => ({
  queueExpiredMedia: mocks.queueExpiredMedia,
  runDueMediaCleanup: mocks.runDueMediaCleanup,
}));

import { MediaCleanupScheduler } from "../../services/media-cleanup.scheduler";

describe("MediaCleanupScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cronSchedule.mockReturnValue({ stop: mocks.stop });
    mocks.queueExpiredMedia.mockResolvedValue(2);
    mocks.runDueMediaCleanup.mockResolvedValue({ attempted: 2, succeeded: 2, failed: 0 });
  });

  it("schedules non-overlapping expiry and cleanup runs and can stop", async () => {
    let callback!: () => void;
    mocks.cronSchedule.mockImplementation((_: string, run: () => void) => {
      callback = run;
      return { stop: mocks.stop };
    });
    const scheduler = MediaCleanupScheduler.getInstance();

    scheduler.start();

    expect(mocks.cronSchedule).toHaveBeenCalledWith(
      "*/15 * * * *",
      expect.any(Function),
      { timezone: "America/New_York" },
    );
    callback();
    callback();
    await vi.waitFor(() => expect(mocks.runDueMediaCleanup).toHaveBeenCalledOnce());
    expect(mocks.queueExpiredMedia).toHaveBeenCalledOnce();

    scheduler.stop();
    expect(mocks.stop).toHaveBeenCalledOnce();
  });
});
