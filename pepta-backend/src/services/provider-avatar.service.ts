import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { ValidationError } from "../lib/errors";
import {
  MediaAssetModel,
  UserModel,
  type UserDocument,
} from "../models";
import {
  attachMedia,
  detachMedia,
  persistImportedAvatarMedia,
} from "./media.service";

const MAX_PROVIDER_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 5_000;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
] as const);

type ProviderContentType =
  | "image/jpeg"
  | "image/png"
  | "image/heic"
  | "image/webp";

function trustedGoogleImageUrl(value: string | URL): URL {
  let url: URL;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    throw new ValidationError("Expected a trusted Google image URL");
  }

  const hostname = url.hostname.toLowerCase();
  const trustedHost =
    hostname === "googleusercontent.com" ||
    hostname.endsWith(".googleusercontent.com");
  if (
    url.protocol !== "https:" ||
    !trustedHost ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  ) {
    throw new ValidationError("Expected a trusted Google image URL");
  }

  return url;
}

function providerFingerprint(pictureUrl: string): string {
  return createHash("sha256").update(pictureUrl).digest("hex");
}

function providerContentType(response: Response): ProviderContentType {
  const contentType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType as never)) {
    throw new ValidationError("Provider returned an invalid image content type");
  }
  return contentType as ProviderContentType;
}

function validateDeclaredSize(response: Response): void {
  const header = response.headers.get("content-length");
  if (header === null) return;
  if (!/^\d+$/.test(header)) {
    throw new ValidationError("Provider returned an invalid image size");
  }
  const size = Number(header);
  if (size > MAX_PROVIDER_BYTES) {
    throw new ValidationError("Provider avatar is too large");
  }
}

async function readLimitedBody(
  response: Response,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!response.body) {
    throw new ValidationError("Provider returned an invalid image");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    if (signal.aborted) {
      throw new ValidationError("Provider avatar request timed out");
    }
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_PROVIDER_BYTES) {
      await Promise.resolve(reader.cancel()).catch(() => undefined);
      throw new ValidationError("Provider avatar is too large");
    }
    chunks.push(value);
  }

  if (total === 0) {
    throw new ValidationError("Provider returned an invalid image");
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function downloadGoogleAvatar(
  pictureUrl: string,
  fetchImpl: typeof fetch,
): Promise<{ bytes: Uint8Array; contentType: ProviderContentType }> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    let currentUrl = trustedGoogleImageUrl(pictureUrl);
    let redirectCount = 0;
    while (true) {
      let response: Response;
      try {
        response = await fetchImpl(currentUrl.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: { Accept: "image/jpeg,image/png,image/webp,image/heic" },
        });
      } catch (error) {
        if (timedOut || controller.signal.aborted) {
          throw new ValidationError("Provider avatar request timed out");
        }
        throw error;
      }

      if (response.status >= 300 && response.status < 400) {
        if (redirectCount >= MAX_REDIRECTS) {
          throw new ValidationError("Provider avatar has too many redirects");
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new ValidationError("Provider returned an invalid redirect");
        }
        currentUrl = trustedGoogleImageUrl(new URL(location, currentUrl));
        redirectCount += 1;
        continue;
      }

      if (!response.ok) {
        throw new ValidationError("Provider avatar could not be downloaded");
      }
      const contentType = providerContentType(response);
      validateDeclaredSize(response);
      const bytes = await readLimitedBody(response, controller.signal);
      return { bytes, contentType };
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshGoogleAvatar(
  user: UserDocument,
  pictureUrl: string,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<void> {
  const fingerprint = providerFingerprint(pictureUrl);
  if (user.providerAvatarFingerprint === fingerprint) return;

  const userId = user._id.toString();
  const previousMediaId = user.avatarMediaId?.toString();
  if (previousMediaId) {
    const active = await MediaAssetModel.findOne({
      _id: new Types.ObjectId(previousMediaId),
      userId: new Types.ObjectId(userId),
      status: "ready",
    });
    if (!active || active.source !== "provider_import") return;
  }

  const imported = await downloadGoogleAvatar(
    pictureUrl,
    deps.fetchImpl ?? fetch,
  );
  const ready = await persistImportedAvatarMedia(userId, imported);
  const link = { kind: "avatar" as const, resourceId: userId };
  await attachMedia(userId, ready.mediaId, link);

  const updated = await UserModel.findOneAndUpdate(
    {
      _id: user._id,
      avatarMediaId: previousMediaId
        ? new Types.ObjectId(previousMediaId)
        : { $exists: false },
      providerAvatarFingerprint:
        user.providerAvatarFingerprint ?? { $exists: false },
    },
    {
      $set: {
        avatarMediaId: new Types.ObjectId(ready.mediaId),
        providerAvatarFingerprint: fingerprint,
      },
    },
    { new: true, runValidators: true },
  );

  if (!updated) {
    if (ready.mediaId !== previousMediaId) {
      await detachMedia(userId, ready.mediaId, link);
    }
    return;
  }

  user.avatarMediaId = new Types.ObjectId(ready.mediaId);
  user.providerAvatarFingerprint = fingerprint;
  if (previousMediaId && previousMediaId !== ready.mediaId) {
    await detachMedia(userId, previousMediaId, link);
  }
}
