import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import { AuthError } from '../lib/errors';

export interface ProviderIdentity {
  provider: 'google' | 'apple';
  providerUserId: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

const googleClient = new OAuth2Client(env.google.clientId);

export async function verifyGoogleIdToken(idToken: string): Promise<ProviderIdentity> {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: [env.google.clientId],
    });
    const payload = ticket.getPayload();

    if (!payload?.sub) {
      throw new AuthError('Google ID token is missing a subject');
    }

    return {
      provider: 'google',
      providerUserId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: payload.name,
      picture: payload.picture,
    };
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }

    throw new AuthError('Google sign-in could not be verified');
  }
}
