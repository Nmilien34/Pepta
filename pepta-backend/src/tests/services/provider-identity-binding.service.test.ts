import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bindVerifiedProviderEmail } from "../../services/provider-identity-binding.service";
import { UserModel } from "../../models/user.model";

vi.mock("../../models/user.model", () => ({
  UserModel: { updateOne: vi.fn() },
}));

const userId = new Types.ObjectId("64b000000000000000000001");
const verifiedAt = new Date("2026-07-23T00:00:00.000Z");

describe("bindVerifiedProviderEmail", () => {
  beforeEach(() => {
    vi.mocked(UserModel.updateOne).mockReset();
  });

  it("writes the normalized email onto the exact provider+subject entry only", async () => {
    vi.mocked(UserModel.updateOne).mockResolvedValue({ matchedCount: 1 } as never);

    await bindVerifiedProviderEmail({
      userId,
      provider: "apple",
      providerUserId: "apple-sub-1",
      email: "  Creator@iCloud.com ",
      verifiedAt,
    });

    expect(UserModel.updateOne).toHaveBeenCalledWith(
      {
        _id: userId,
        authProviders: {
          $elemMatch: { provider: "apple", providerUserId: "apple-sub-1" },
        },
      },
      {
        $set: {
          "authProviders.$.verifiedEmailNormalized": "creator@icloud.com",
          "authProviders.$.emailVerifiedAt": verifiedAt,
        },
      },
    );
  });

  it("a conditional-update miss (no matching subject) rejects — never silent", async () => {
    vi.mocked(UserModel.updateOne).mockResolvedValue({ matchedCount: 0 } as never);
    await expect(
      bindVerifiedProviderEmail({
        userId,
        provider: "google",
        providerUserId: "other-subject",
        email: "a@b.com",
        verifiedAt,
      }),
    ).rejects.toThrow(/could not be bound/);
  });

  it("a persistence error propagates to the caller", async () => {
    vi.mocked(UserModel.updateOne).mockRejectedValue(new Error("mongo down"));
    await expect(
      bindVerifiedProviderEmail({
        userId,
        provider: "google",
        providerUserId: "g1",
        email: "a@b.com",
        verifiedAt,
      }),
    ).rejects.toThrow("mongo down");
  });
});
