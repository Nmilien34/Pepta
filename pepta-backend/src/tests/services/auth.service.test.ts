import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userCreate: vi.fn(),
  userFindOne: vi.fn(),
  verifyAppleIdentityToken: vi.fn(),
  verifyGoogleIdToken: vi.fn(),
}));

vi.mock("../../auth/google", () => ({
  verifyGoogleIdToken: mocks.verifyGoogleIdToken,
}));

vi.mock("../../auth/apple", () => ({
  verifyAppleIdentityToken: mocks.verifyAppleIdentityToken,
}));

vi.mock("../../models", () => ({
  UserModel: {
    create: mocks.userCreate,
    findOne: mocks.userFindOne,
  },
  UserProfileModel: {
    exists: vi.fn(),
  },
}));

import { verifySessionJwt } from "../../auth/jwt";
import { signInWithApple, signInWithGoogle } from "../../services/auth.service";

interface MockAuthProvider {
  provider: string;
  providerUserId: string;
  linkedAt: Date;
}

interface MockUserDocument extends Record<string, unknown> {
  _id: unknown;
  id?: string;
  email?: string;
  emailVerified: boolean;
  authProviders: MockAuthProvider[];
  entitlement: {
    status: string;
    expiresAt: Date | null;
    willRenew: boolean;
  };
  onboardingComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
  save: ReturnType<typeof vi.fn>;
}

function userDocument(value: Partial<MockUserDocument>): MockUserDocument {
  return {
    _id: value.id,
    emailVerified: false,
    authProviders: [],
    entitlement: {
      status: "free",
      expiresAt: null,
      willRenew: false,
    },
    onboardingComplete: false,
    createdAt: new Date("2026-06-22T00:00:00.000Z"),
    updatedAt: new Date("2026-06-22T00:00:00.000Z"),
    save: vi.fn().mockResolvedValue(undefined),
    ...value,
  };
}

describe("auth service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a user from a Google identity and returns a valid Pepta JWT", async () => {
    mocks.verifyGoogleIdToken.mockResolvedValue({
      provider: "google",
      providerUserId: "google-sub-1",
      email: "USER@example.com",
      emailVerified: true,
      name: "Pepta User",
      picture: "https://example.com/avatar.png",
    });
    mocks.userFindOne.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue(
      userDocument({
        id: "507f1f77bcf86cd799439011",
        email: "user@example.com",
        emailVerified: true,
        displayName: "Pepta User",
        avatarUrl: "https://example.com/avatar.png",
        authProviders: [
          {
            provider: "google",
            providerUserId: "google-sub-1",
            linkedAt: new Date("2026-06-22T00:00:00.000Z"),
          },
        ],
      }),
    );

    const result = await signInWithGoogle("google-id-token");

    expect(mocks.userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        emailVerified: true,
        displayName: "Pepta User",
        avatarUrl: "https://example.com/avatar.png",
        onboardingComplete: false,
        entitlement: {
          status: "free",
          expiresAt: null,
          willRenew: false,
        },
      }),
    );
    expect(verifySessionJwt(result.token).sub).toBe("507f1f77bcf86cd799439011");
    expect(result.user.email).toBe("user@example.com");
    expect(result.user.authProviders).toHaveLength(1);
    expect(result.isNewUser).toBe(true);
  });

  it("returns the same user for a repeated Google provider identity", async () => {
    const existing = userDocument({
      id: "507f1f77bcf86cd799439011",
      email: "user@example.com",
      emailVerified: true,
      authProviders: [
        {
          provider: "google",
          providerUserId: "google-sub-1",
          linkedAt: new Date("2026-06-21T00:00:00.000Z"),
        },
      ],
    });
    mocks.verifyGoogleIdToken.mockResolvedValue({
      provider: "google",
      providerUserId: "google-sub-1",
      email: "user@example.com",
      emailVerified: true,
    });
    mocks.userFindOne.mockResolvedValue(existing);

    const result = await signInWithGoogle("google-id-token");

    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(existing.authProviders).toHaveLength(1);
    expect(existing.save).toHaveBeenCalled();
    expect(result.user.id).toBe("507f1f77bcf86cd799439011");
    expect(result.isNewUser).toBe(false);
  });

  it("links an Apple identity to an existing verified email account", async () => {
    const existing = userDocument({
      id: "507f1f77bcf86cd799439011",
      email: "user@example.com",
      emailVerified: true,
      authProviders: [
        {
          provider: "google",
          providerUserId: "google-sub-1",
          linkedAt: new Date("2026-06-21T00:00:00.000Z"),
        },
      ],
    });
    mocks.verifyAppleIdentityToken.mockResolvedValue({
      provider: "apple",
      providerUserId: "apple-sub-1",
      email: "USER@example.com",
      emailVerified: true,
      name: "Apple Name",
    });
    mocks.userFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);

    const result = await signInWithApple({
      identityToken: "apple-id-token",
      fullName: { givenName: "Apple", familyName: "Name" },
    });

    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(existing.authProviders.map((provider) => provider.provider)).toEqual(
      ["google", "apple"],
    );
    expect(existing.save).toHaveBeenCalled();
    expect(result.user.authProviders).toHaveLength(2);
    expect(result.isNewUser).toBe(false);
  });
});
