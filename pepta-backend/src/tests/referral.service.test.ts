import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, NotFoundError, ValidationError } from "../lib/errors";
import {
  claimReferralCode,
  normalizeReferralCode,
} from "../services/referral.service";
import {
  ReferralClaimModel,
  ReferralCodeModel,
} from "../models/referral.model";

vi.mock("../models/referral.model", () => ({
  ReferralClaimModel: { findOne: vi.fn(), create: vi.fn() },
  ReferralCodeModel: { findOne: vi.fn() },
}));

// The service reads via `.findOne(...).lean()`.
function lean<T>(value: T) {
  return { lean: () => Promise.resolve(value) } as never;
}

const USER = "64b000000000000000000001";

describe("normalizeReferralCode", () => {
  it("trims, uppercases, and strips separators", () => {
    expect(normalizeReferralCode("  pep-20 ")).toBe("PEP20");
    expect(normalizeReferralCode("pep_2 0")).toBe("PEP20");
  });
});

describe("claimReferralCode", () => {
  beforeEach(() => {
    vi.mocked(ReferralClaimModel.findOne).mockReset();
    vi.mocked(ReferralClaimModel.create).mockReset();
    vi.mocked(ReferralCodeModel.findOne).mockReset();
  });

  it("claims an active registered code and stores the normalized form", async () => {
    vi.mocked(ReferralClaimModel.findOne).mockReturnValue(lean(null));
    vi.mocked(ReferralCodeModel.findOne).mockReturnValue(
      lean({ _id: "code-1", code: "PEP20", expiresAt: null }),
    );
    vi.mocked(ReferralClaimModel.create).mockResolvedValue({} as never);

    await expect(claimReferralCode(USER, { code: " pep-20 " })).resolves.toEqual({
      code: "PEP20",
      alreadyClaimed: false,
    });
    expect(ReferralCodeModel.findOne).toHaveBeenCalledWith({
      code: "PEP20",
      active: true,
    });
    expect(ReferralClaimModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, codeId: "code-1", code: "PEP20" }),
    );
  });

  it("rejects garbage that normalizes to nothing valid", async () => {
    await expect(claimReferralCode(USER, { code: " !!! " })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(ReferralClaimModel.findOne).not.toHaveBeenCalled();
  });

  it("404s unknown or inactive codes without creating anything", async () => {
    vi.mocked(ReferralClaimModel.findOne).mockReturnValue(lean(null));
    vi.mocked(ReferralCodeModel.findOne).mockReturnValue(lean(null));

    await expect(claimReferralCode(USER, { code: "NOPE" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(ReferralClaimModel.create).not.toHaveBeenCalled();
  });

  it("404s expired codes", async () => {
    vi.mocked(ReferralClaimModel.findOne).mockReturnValue(lean(null));
    vi.mocked(ReferralCodeModel.findOne).mockReturnValue(
      lean({ _id: "code-1", code: "OLD1", expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(claimReferralCode(USER, { code: "OLD1" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("is idempotent when the same code is claimed again", async () => {
    vi.mocked(ReferralClaimModel.findOne).mockReturnValue(
      lean({ code: "PEP20" }),
    );

    await expect(claimReferralCode(USER, { code: "pep20" })).resolves.toEqual({
      code: "PEP20",
      alreadyClaimed: true,
    });
    expect(ReferralClaimModel.create).not.toHaveBeenCalled();
  });

  it("409s a second, different code for the same account", async () => {
    vi.mocked(ReferralClaimModel.findOne).mockReturnValue(
      lean({ code: "PEP20" }),
    );

    const attempt = claimReferralCode(USER, { code: "OTHER1" });
    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(
      claimReferralCode(USER, { code: "OTHER1" }).catch((e: AppError) => e.statusCode),
    ).resolves.toBe(409);
  });

  it("resolves a concurrent double-claim race like the sequential path", async () => {
    vi.mocked(ReferralClaimModel.findOne)
      .mockReturnValueOnce(lean(null))
      .mockReturnValueOnce(lean({ code: "PEP20" }));
    vi.mocked(ReferralCodeModel.findOne).mockReturnValue(
      lean({ _id: "code-1", code: "PEP20", expiresAt: null }),
    );
    vi.mocked(ReferralClaimModel.create).mockRejectedValue(
      Object.assign(new Error("dup"), { code: 11000 }),
    );

    await expect(claimReferralCode(USER, { code: "PEP20" })).resolves.toEqual({
      code: "PEP20",
      alreadyClaimed: true,
    });
  });
});
