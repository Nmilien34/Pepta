import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeImage } from "../../services/image-normalization.service";

describe("canonical image normalization", () => {
  it("resizes, converts to JPEG, and strips EXIF metadata", async () => {
    const input = await sharp({
      create: {
        width: 2400,
        height: 1200,
        channels: 3,
        background: "#cc9966",
      },
    })
      .withExif({ IFD0: { Artist: "private-camera-owner" } })
      .png()
      .toBuffer();

    const output = await normalizeImage(input, {
      maxBytes: 5 * 1024 * 1024,
      maxEdge: 1600,
    });
    const metadata = await sharp(output.bytes).metadata();

    expect(output.contentType).toBe("image/jpeg");
    expect(output.width).toBe(1600);
    expect(output.height).toBe(800);
    expect(metadata.format).toBe("jpeg");
    expect(metadata.exif).toBeUndefined();
  });

  it("rejects encoded input over the purpose limit before decoding", async () => {
    await expect(
      normalizeImage(Uint8Array.of(1, 2, 3), {
        maxBytes: 2,
        maxEdge: 1600,
      }),
    ).rejects.toThrow(/too large/i);
  });

  it("returns a safe validation error for bytes that are not an image", async () => {
    await expect(
      normalizeImage(new TextEncoder().encode("not-an-image"), {
        maxBytes: 100,
        maxEdge: 1600,
      }),
    ).rejects.toThrow(/^Invalid image$/);
  });
});
