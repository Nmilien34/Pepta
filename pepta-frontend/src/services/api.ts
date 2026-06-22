import {
  appleAuthSchema,
  authResponseSchema,
  googleAuthSchema,
  homeResponseSchema,
  progressResponseSchema,
  trackResponseSchema,
  type AppleAuth,
  type AuthResponse,
  type GoogleAuth,
  type HomeResponse,
  type ProgressResponse,
  type TrackResponse,
} from '@pepta/shared';
import { z } from 'zod';
import { API_BASE_URL } from '../config';

type ResponseSchema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

class PeptaApi {
  private authToken: string | null = null;

  public setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  private async request<T>(
    path: string,
    schema: ResponseSchema<T>,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
        ...options.headers,
      },
    });
    const json = (await response.json()) as unknown;

    if (!response.ok) {
      throw new Error(`Pepta API request failed: ${response.status}`);
    }

    const envelope = z.object({ data: z.unknown() }).parse(json);
    return schema.parse(envelope.data);
  }

  public signInWithGoogle(body: GoogleAuth): Promise<AuthResponse> {
    return this.request('/auth/google', authResponseSchema, {
      method: 'POST',
      body: JSON.stringify(googleAuthSchema.parse(body)),
    });
  }

  public signInWithApple(body: AppleAuth): Promise<AuthResponse> {
    return this.request('/auth/apple', authResponseSchema, {
      method: 'POST',
      body: JSON.stringify(appleAuthSchema.parse(body)),
    });
  }

  public getHome(): Promise<HomeResponse> {
    return this.request('/home', homeResponseSchema);
  }

  public getTrack(): Promise<TrackResponse> {
    return this.request('/track', trackResponseSchema);
  }

  public getProgress(): Promise<ProgressResponse> {
    return this.request('/progress', progressResponseSchema);
  }
}

export const api = new PeptaApi();
