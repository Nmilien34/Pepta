import type { AppleAuth, AuthResponse } from "@pepta/shared";
import { verifyAppleIdentityToken } from "../auth/apple";
import { verifyGoogleIdToken } from "../auth/google";
import { issueSessionJwt } from "../auth/jwt";
import { serializeUser, upsertUserFromIdentity } from "./user.service";

function buildAppleDisplayName(
  fullName: AppleAuth["fullName"],
): string | undefined {
  if (!fullName) {
    return undefined;
  }

  const parts = [fullName.givenName, fullName.familyName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" ") : undefined;
}

export async function signInWithGoogle(idToken: string): Promise<AuthResponse> {
  const identity = await verifyGoogleIdToken(idToken);
  const user = await upsertUserFromIdentity(identity);
  const userId = user._id.toString();

  return {
    token: issueSessionJwt(userId),
    user: serializeUser(user),
  };
}

export async function signInWithApple(input: AppleAuth): Promise<AuthResponse> {
  const identity = await verifyAppleIdentityToken(input.identityToken);
  const user = await upsertUserFromIdentity({
    ...identity,
    name: buildAppleDisplayName(input.fullName) ?? identity.name,
  });
  const userId = user._id.toString();

  return {
    token: issueSessionJwt(userId),
    user: serializeUser(user),
  };
}
