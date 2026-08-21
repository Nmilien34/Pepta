import sharp from "sharp";
import { ValidationError } from "../lib/errors";

export interface NormalizedImage {
  bytes: Uint8Array;
  contentType: "image/jpeg";
  width: number;
  height: number;
}

export async function normalizeImage(
  bytes: Uint8Array,
  limits: { maxBytes: number; maxEdge: number; maxPixels?: number },
): Promise<NormalizedImage> {
  if (bytes.byteLength > limits.maxBytes) {
    throw new ValidationError("Image is too large");
  }

  try {
    const output = await sharp(bytes, {
      limitInputPixels: limits.maxPixels ?? 24_000_000,
    })
      .rotate()
      .resize({
        width: limits.maxEdge,
        height: limits.maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    if (!output.info.width || !output.info.height) {
      throw new ValidationError("Invalid image");
    }

    return {
      bytes: output.data,
      contentType: "image/jpeg",
      width: output.info.width,
      height: output.info.height,
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError("Invalid image");
  }
}
