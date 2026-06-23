// Generates the Pepta app icon from the Pep mascot vectors (mirrors
// src/components/Mascot.tsx): full-color Pep on a soft light-lavender background.
// Run: node scripts/make-icon.mjs   → assets/icon.png + assets/adaptive-icon.png
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync } from 'node:fs';

const PEP = `
  <rect x="34" y="1" width="52" height="7" rx="3.5" fill="#6E4EF0"/>
  <rect x="55" y="6" width="10" height="10" rx="3" fill="#7C5CFC"/>
  <rect x="27" y="14" width="66" height="112" rx="33" fill="url(#pepBody)"/>
  <path d="M27 70 a33 33 0 0 0 66 0 v23 a33 33 0 0 1 -66 0 Z" fill="#0E0E12" opacity="0.07"/>
  <ellipse cx="48" cy="38" rx="15" ry="11" fill="#fff" opacity="0.28"/>
  <ellipse cx="50" cy="64" rx="8" ry="9" fill="#fff"/>
  <ellipse cx="74" cy="64" rx="8" ry="9" fill="#fff"/>
  <circle cx="51.5" cy="66" r="3.7" fill="#1A1430"/>
  <circle cx="75.5" cy="66" r="3.7" fill="#1A1430"/>
  <circle cx="53" cy="64.5" r="1.3" fill="#fff"/>
  <circle cx="77" cy="64.5" r="1.3" fill="#fff"/>
  <ellipse cx="39" cy="80" rx="6" ry="3.8" fill="#FF9CB6" opacity="0.6"/>
  <ellipse cx="85" cy="80" rx="6" ry="3.8" fill="#FF9CB6" opacity="0.6"/>
  <path d="M53 81 q7 6.5 14 0" stroke="#1A1430" stroke-width="3.2" fill="none" stroke-linecap="round"/>
  <g stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.6">
    <line x1="33" y1="94" x2="47" y2="94"/><line x1="33" y1="101" x2="42" y2="101"/>
    <line x1="33" y1="108" x2="47" y2="108"/><line x1="33" y1="115" x2="42" y2="115"/>
    <line x1="33" y1="122" x2="47" y2="122"/>
  </g>`;

const DEFS = `<defs>
  <radialGradient id="lightbg" cx="0.5" cy="0.4" r="0.85">
    <stop offset="0" stop-color="#FBF9FF"/><stop offset="1" stop-color="#E9DEFF"/>
  </radialGradient>
  <linearGradient id="pepBody" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#9C82FF"/><stop offset="1" stop-color="#6E4EF0"/>
  </linearGradient>
  <filter id="sh" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="26"/></filter>
</defs>`;

// Main icon — Pep at ~59% height, centered (content center is 60,63.5 in a 120x142 box).
const icon = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${DEFS}
  <rect width="1024" height="1024" fill="url(#lightbg)"/>
  <ellipse cx="512" cy="838" rx="208" ry="40" fill="#6E4EF0" opacity="0.16" filter="url(#sh)"/>
  <g transform="translate(224,207) scale(4.8)">${PEP}</g>
</svg>`;

// Android adaptive foreground — smaller (fits the masked safe zone), transparent bg.
const adaptive = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${DEFS}
  <g transform="translate(260,245) scale(4.2)">${PEP}</g>
</svg>`;

function render(svg, out) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng();
  writeFileSync(out, png);
  console.log('wrote', out, `(${(png.length / 1024).toFixed(0)} KB)`);
}

mkdirSync('assets', { recursive: true });
render(icon, 'assets/icon.png');
render(adaptive, 'assets/adaptive-icon.png');
