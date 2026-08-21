// color-mix(in srgb, currentColor 13%, transparent) — the frame's chip tint,
// which React Native has no equivalent for.
//
// Pure and standalone so it tests without react-native in the graph; CardIcon
// imports it. See CardIcon.tsx for why the chip matters.

/** The frame's 13% of currentColor. */
const TINT_ALPHA = 0.13;

/**
 * Accept #RGB/#RRGGBB or rgb()/rgba() and return the same hue at `alpha`.
 * Falls back to the colour untouched rather than throwing — a header that
 * renders in the wrong tint is a smaller failure than one that does not render.
 */
export function tint(color: string, alpha: number = TINT_ALPHA): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const h = hex[1]!;
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(color.trim());
  if (rgb) return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${alpha})`;
  return color;
}
