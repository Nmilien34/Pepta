import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  prepareComplimentaryCleanupForDeletion,
  retryCleanup,
  runDueCleanups,
} from "../../services/complimentary-access-cleanup.service";
import { ComplimentaryAccessCleanupModel } from "../../models/complimentary-access-cleanup.model";
import { ComplimentaryAccessGrantModel } from "../../models/complimentary-access.model";
import {
  isRevenueCatConfigured,
  revokePromotionalEntitlement,
  RevenueCatClientError,
} from "../../services/revenuecat.client";
import type { UserDocument } from "../../models/user.model";

vi.mock("../../models/complimentary-access-cleanup.model", () => ({
  ComplimentaryAccessCleanupModel: {
    deleteOne: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

vi.mock("../../models/complimentary-access.model", () => ({
  ComplimentaryAccessGrantModel: { findOne: vi.fn() },
  AccessAuditEventModel: { create: vi.fn(() => Promise.resolve({})) },
}));

vi.mock("../../services/revenuecat.client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../services/revenuecat.client")>();
  return {
    ...original,
    isRevenueCatConfigured: vi.fn(() => true),
    revokePromotionalEntitlement: vi.fn(),
  };
});

const user = {
  _id: "64b000000000000000000001",
} as unknown as UserDocument;

interface MockCleanupTask {
  [key: string]: unknown;
  _id: string;
  revenueCatAppUserId: string;
  entitlementId: string;
  status: string;
  attemptCount: number;
  nextAttemptAt?: Date;
  lastErrorCode?: string;
  leaseId?: string;
  leaseExpiresAt?: Date;
  save: ReturnType<typeof vi.fn>;
}

function makeTask(
  overrides: Partial<MockCleanupTask> = {},
): MockCleanupTask {
  return {
    _id: "task-1",
    revenueCatAppUserId: "64b000000000000000000001",
    entitlementId: "pro",
    status: "pending",
    attemptCount: 0,
    save: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function dueQuery(tasks: unknown[]) {
  return {
    limit: () => Promise.resolve(tasks),
  };
}

describe("prepareComplimentaryCleanupForDeletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isRevenueCatConfigured).mockReturnValue(true);
  });

  it("does nothing when the user has no grant", async () => {
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValue(null);

    await prepareComplimentaryCleanupForDeletion(user);

    expect(
      ComplimentaryAccessCleanupModel.findOneAndUpdate,
    ).not.toHaveBeenCalled();
  });

  it("removes an untouched pending grant directly without RevenueCat or a cleanup task", async () => {
    const grant = {
      status: "pending",
      operationId: undefined,
      deleteOne: vi.fn(() => Promise.resolve()),
    };
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValue(
      grant as never,
    );

    await prepareComplimentaryCleanupForDeletion(user);

    expect(grant.deleteOne).toHaveBeenCalledOnce();
    expect(
      ComplimentaryAccessCleanupModel.findOneAndUpdate,
    ).not.toHaveBeenCalled();
    expect(revokePromotionalEntitlement).not.toHaveBeenCalled();
  });

  it("upserts an email-free task before deleting a possibly-remote grant", async () => {
    const grant = {
      status: "active",
      operationId: "op-1",
      deleteOne: vi.fn(() => Promise.resolve()),
    };
    const task = makeTask();
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValue(
      grant as never,
    );
    vi.mocked(
      ComplimentaryAccessCleanupModel.findOneAndUpdate,
    ).mockResolvedValueOnce(task as never);
    vi.mocked(isRevenueCatConfigured).mockReturnValue(false);

    await prepareComplimentaryCleanupForDeletion(user);

    expect(
      vi.mocked(ComplimentaryAccessCleanupModel.findOneAndUpdate).mock
        .invocationCallOrder[0],
    ).toBeLessThan(grant.deleteOne.mock.invocationCallOrder[0]!);
    expect(
      vi.mocked(ComplimentaryAccessCleanupModel.findOneAndUpdate).mock
        .calls[0]?.[1],
    ).not.toEqual(
      expect.objectContaining({
        email: expect.anything(),
        emailNormalized: expect.anything(),
      }),
    );
    expect(
      ComplimentaryAccessCleanupModel.findOneAndUpdate,
    ).toHaveBeenCalledWith(
      {
        revenueCatAppUserId: "64b000000000000000000001",
        entitlementId: "pro",
      },
      {
        $setOnInsert: expect.objectContaining({
          revenueCatAppUserId: "64b000000000000000000001",
          entitlementId: "pro",
          status: "pending",
          attemptCount: 0,
        }),
      },
      { new: true, upsert: true },
    );
  });

  it("keeps account deletion available while an immediate RevenueCat attempt fails", async () => {
    const grant = {
      status: "active",
      operationId: "op-1",
      deleteOne: vi.fn(() => Promise.resolve()),
    };
    const queued = makeTask();
    const leased = makeTask({ status: "processing", attemptCount: 1 });
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValue(
      grant as never,
    );
    vi.mocked(ComplimentaryAccessCleanupModel.findOneAndUpdate)
      .mockResolvedValueOnce(queued as never)
      .mockResolvedValueOnce(leased as never);
    vi.mocked(revokePromotionalEntitlement).mockRejectedValue(
      new RevenueCatClientError("retryable", 503, "down"),
    );

    await expect(
      prepareComplimentaryCleanupForDeletion(user),
    ).resolves.toBeUndefined();

    expect(grant.deleteOne).toHaveBeenCalledOnce();
    expect(leased.status).toBe("retryable_failure");
    expect(leased.lastErrorCode).toBe("RETRYABLE");
    expect(leased.nextAttemptAt).toBeInstanceOf(Date);
  });
});

describe("runDueCleanups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isRevenueCatConfigured).mockReturnValue(true);
  });

  it("revokes only the promotional entitlement and removes a successful task", async () => {
    const queued = makeTask();
    const leased = makeTask({ status: "processing", attemptCount: 1 });
    vi.mocked(ComplimentaryAccessCleanupModel.find).mockReturnValue(
      dueQuery([queued]) as never,
    );
    vi.mocked(
      ComplimentaryAccessCleanupModel.findOneAndUpdate,
    ).mockResolvedValue(leased as never);
    vi.mocked(revokePromotionalEntitlement).mockResolvedValue(undefined);
    vi.mocked(ComplimentaryAccessCleanupModel.deleteOne).mockResolvedValue(
      { deletedCount: 1 } as never,
    );

    await expect(runDueCleanups("worker")).resolves.toEqual({
      attempted: 1,
      succeeded: 1,
    });

    expect(revokePromotionalEntitlement).toHaveBeenCalledWith(
      "64b000000000000000000001",
      "pro",
    );
    expect(ComplimentaryAccessCleanupModel.deleteOne).toHaveBeenCalledWith({
      _id: "task-1",
      leaseId: expect.any(String),
    });
    expect(leased.save).not.toHaveBeenCalled();
  });

  it("treats a remote 404 as complete and removes the task", async () => {
    const queued = makeTask();
    const leased = makeTask({
      status: "processing",
      attemptCount: 1,
      leaseId: "lease-1",
    });
    vi.mocked(ComplimentaryAccessCleanupModel.find).mockReturnValue(
      dueQuery([queued]) as never,
    );
    vi.mocked(
      ComplimentaryAccessCleanupModel.findOneAndUpdate,
    ).mockResolvedValue(leased as never);
    vi.mocked(revokePromotionalEntitlement).mockRejectedValue(
      new RevenueCatClientError("not_found", 404, "gone"),
    );

    const summary = await runDueCleanups("worker");

    expect(summary.succeeded).toBe(1);
    expect(ComplimentaryAccessCleanupModel.deleteOne).toHaveBeenCalledWith({
      _id: "task-1",
      leaseId: expect.any(String),
    });
  });

  it("retains retryable failures with bounded backoff", async () => {
    const queued = makeTask();
    const leased = makeTask({ status: "processing", attemptCount: 1 });
    vi.mocked(ComplimentaryAccessCleanupModel.find).mockReturnValue(
      dueQuery([queued]) as never,
    );
    vi.mocked(
      ComplimentaryAccessCleanupModel.findOneAndUpdate,
    ).mockResolvedValue(leased as never);
    vi.mocked(revokePromotionalEntitlement).mockRejectedValue(
      new RevenueCatClientError("retryable", 503, "down"),
    );

    const summary = await runDueCleanups("worker");

    expect(summary).toEqual({ attempted: 1, succeeded: 0 });
    expect(leased.status).toBe("retryable_failure");
    expect(leased.nextAttemptAt).toBeInstanceOf(Date);
    expect(leased.leaseId).toBeUndefined();
    expect(leased.leaseExpiresAt).toBeUndefined();
    expect(leased.save).toHaveBeenCalledOnce();
    expect(ComplimentaryAccessCleanupModel.deleteOne).not.toHaveBeenCalled();
  });

  it("parks terminal failures for an operator without deleting the task", async () => {
    const queued = makeTask();
    const leased = makeTask({ status: "processing", attemptCount: 1 });
    vi.mocked(ComplimentaryAccessCleanupModel.find).mockReturnValue(
      dueQuery([queued]) as never,
    );
    vi.mocked(
      ComplimentaryAccessCleanupModel.findOneAndUpdate,
    ).mockResolvedValue(leased as never);
    vi.mocked(revokePromotionalEntitlement).mockRejectedValue(
      new RevenueCatClientError("terminal", 401, "bad key"),
    );

    const summary = await runDueCleanups("worker");

    expect(summary.succeeded).toBe(0);
    expect(leased.status).toBe("terminal_failure");
    expect(leased.lastErrorCode).toBe("TERMINAL");
    expect(leased.nextAttemptAt).toBeUndefined();
    expect(leased.save).toHaveBeenCalledOnce();
  });

  it("re-arms a terminal task for an explicit operator retry", async () => {
    const parked = makeTask({
      status: "terminal_failure",
      attemptCount: 3,
      lastErrorCode: "TERMINAL",
    });
    const leased = makeTask({
      status: "processing",
      attemptCount: 4,
      leaseId: "lease-1",
    });
    vi.mocked(ComplimentaryAccessCleanupModel.findById).mockResolvedValue(
      parked as never,
    );
    vi.mocked(
      ComplimentaryAccessCleanupModel.findOneAndUpdate,
    ).mockResolvedValue(leased as never);
    vi.mocked(revokePromotionalEntitlement).mockResolvedValue(undefined);

    await expect(retryCleanup("task-1")).resolves.toBe(true);

    expect(parked.status).toBe("retryable_failure");
    expect(parked.lastErrorCode).toBeUndefined();
    expect(parked.leaseId).toBeUndefined();
    expect(parked.leaseExpiresAt).toBeUndefined();
    expect(parked.save).toHaveBeenCalledOnce();
  });
});
