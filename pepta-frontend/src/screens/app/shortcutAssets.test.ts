// The Home shortcut tile assets must be SQUARE.
//
// The tile is a 36×36 box with resizeMode="cover" (design: 36px, object-fit
// cover, background-position center — the implementation has always matched).
// Cover fills that square by cropping whatever does not fit, so a non-square
// source loses its edges: hydration.jpg shipped at 149×288, and the square crop
// showed nothing but the middle band of the Vita Coco carton, magnified. It
// read as a blurry zoom because that is exactly what it was.
//
// The design's own embedded tiles were 168×168 with the subject inset — the
// composition survives a square crop because there is nothing outside the
// square to lose. The assets were the thing that drifted, not the CSS.
//
// So: square is the contract between the asset and the tile, and a test is the
// only place to state it. Nothing else in the pipeline looks at aspect ratio —
// Metro will happily bundle a panorama and the tile will happily crop it.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHORTCUTS_DIR = join(__dirname, '..', '..', '..', 'assets', 'shortcuts');

/**
 * Width/height straight from the JPEG's SOF segment.
 *
 * Hand-parsed rather than pulled from a dependency: this test exists to police
 * the build, so it should not add something to the build to do it.
 */
function jpegSize(bytes: Buffer): { width: number; height: number } {
  let i = 2; // skip SOI
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1]!;
    // SOF0..SOF15 carry the frame header; C4 (DHT), C8 (JPG) and CC (DAC) do not.
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    }
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  throw new Error('no JPEG frame header found');
}

const files = readdirSync(SHORTCUTS_DIR).filter((f) => f.endsWith('.jpg'));

describe('Home shortcut tile assets', () => {
  it('has an asset for every tile', () => {
    expect(files.sort()).toEqual(['fiber.jpg', 'hydration.jpg', 'meals.jpg', 'recipes.jpg']);
  });

  it.each(files)('%s is square, so the 36×36 cover crop loses nothing', (file) => {
    const { width, height } = jpegSize(readFileSync(join(SHORTCUTS_DIR, file)));

    expect(width).toBe(height);
  });

  it.each(files)('%s is big enough for a 3× screen', (file) => {
    // 36pt at @3x is 108px. Anything smaller is upscaled by the OS and the
    // "quality" problem comes back wearing different clothes.
    const { width } = jpegSize(readFileSync(join(SHORTCUTS_DIR, file)));

    expect(width).toBeGreaterThanOrEqual(108);
  });
});
