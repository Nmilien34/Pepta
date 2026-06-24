// Typed auth fixtures for tests (and dev). Reused across context/service tests
// so we don't hand-roll a User in every file. Typed against @pepta/shared so a
// schema change surfaces here first.

import type { AuthResponse, User } from "@pepta/shared";

export const mockUser: User = {
  id: "user_1",
  emailVerified: true,
  authProviders: [],
  entitlement: { status: "free", expiresAt: null, willRenew: false },
  onboardingComplete: false,
  createdAt: "2026-06-23T12:00:00.000Z",
  updatedAt: "2026-06-23T12:00:00.000Z",
};

export const mockAuthResponse: AuthResponse = {
  token: "token_1",
  user: mockUser,
};

export function makeAuthResponse(overrides: Partial<User> = {}): AuthResponse {
  return {
    token: "token_1",
    user: { ...mockUser, ...overrides },
  };
}
