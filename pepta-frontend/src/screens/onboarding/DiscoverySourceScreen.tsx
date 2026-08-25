// Onboarding — "Where did you find us?" (step 7). A spoken convo turn: tap →
// sent bubble (mark riding along) → auto-advance. Sits right after
// fearAnswered — the user just received their worry answered, so the one ask
// that serves US lands at a trust peak — and before the skip-gated medication
// block, so every journey stage gets asked. The next screen (medication) is
// UNTOUCHED: no echo lines, the sent-bubble beat is the whole acknowledgment
// (Nick, rev 4).
//
// A LIST, NOT A CHIP GRID (2026-08-24). The chips were content-sized and
// wrapped, so nothing aligned: no two labels shared a left edge, the right
// edge ragged differently on every line, and which answers happened to pair up
// was decided by string length — "App Store search" sat alone on row one purely
// because it was the longest, which reads as a hierarchy that does not exist.
// Rows give the tile, the label and the chevron one shared edge each. They are
// also a fixed 60pt, so the column measures the same at 100% and 200% Dynamic
// Type where the padding-driven chips grew with the text.
//
// FIXED order, by explicit call (Nick, 2026-08-06): App Store search + Friends
// lead because they're where users actually come from today; Facebook/Instagram
// next; TikTok/YouTube last among brands (no ads or posting there yet — leading
// with a channel we're not on reads wrong). "Somewhere else" stays pinned last
// as the honest catch-all (a forced six-way pick inflates every listed channel).
//
// REDDIT added 2026-08-24, placed third. Nick's rule mixes two criteria —
// where users come from, and whether we're present on the channel — and Reddit
// scores high on the first and zero on the second. Ranked on volume here,
// because until now it had no row at all: every r/Ozempic and r/GLP1 arrival
// was answering "Somewhere else", so the attribution understated it to zero.

import React from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { DiscoverySource } from '@pepta/shared';
import { ConvoScreen, type ConvoOption } from '../../components';
import appStoreIcon from '../../../assets/discovery-appstore.png';
import instagramIcon from '../../../assets/discovery-instagram.png';
import redditIcon from '../../../assets/discovery-reddit.png';

/**
 * Every mark occupies the same 40pt square. ConvoScreen scales this down for
 * the sent bubble, so the size is fixed here and nowhere else.
 */
const SIZE = 40;
/**
 * 10, because that is what the SVG marks already draw: each is authored in a
 * 26-unit viewBox with `rx 6.5`, and at SIZE that renders as 6.5 x 40/26 = 10
 * exactly. Clipping the PNGs at anything else puts two different corner radii
 * in one column. (The App Store PNG's own corners are baked at ~8.95 — iOS
 * icon radius is 22.37% of the icon's width — so it sits ~1pt tighter than the
 * rest. That cannot be changed without re-cutting the asset, and 1pt at 40 is
 * below the threshold where the column stops reading as one family.)
 */
const RADIUS = 10;

/**
 * How a mark meets the slot. WHICH ONE A MARK NEEDS IS A PROPERTY OF THE FILE,
 * not a style preference, and each was verified by decoding the asset:
 *
 *   bleed  — the mark already carries its own shape and corners. The App Store
 *            PNG is RGBA with alpha 0 at all four corners; clipping it again
 *            at RADIUS would shave them.
 *   clip   — a hard rectangle with no transparency anywhere. The Reddit PNG is
 *            8-bit indexed with no tRNS chunk and pure #FF4500 on every edge;
 *            discovery-instagram.png is RGB with no alpha channel at all. The
 *            slot is the only place either one's corners can come from.
 *   ground — a glyph smaller than the slot, which needs a surface under it.
 */
type MarkFit = 'bleed' | 'clip' | 'ground';

function Slot({
  fit,
  ground,
  children,
}: {
  fit: MarkFit;
  ground?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
        fit !== 'bleed' && { borderRadius: RADIUS, overflow: 'hidden' },
        ground != null && { backgroundColor: ground },
      ]}
    >
      {children}
    </View>
  );
}

/** A square PNG filling its slot. `cover` so a clipped mark leaves no gap. */
function Photo({ source, fit }: { source: ImageSourcePropType; fit: MarkFit }) {
  return (
    <Slot fit={fit}>
      <Image
        source={source}
        style={{ width: '100%', height: '100%' }}
        resizeMode={fit === 'bleed' ? 'contain' : 'cover'}
      />
    </Slot>
  );
}

// The SVG marks draw their own rect or circle at full bleed, so they need
// neither ground nor clip — the shape in the path IS the tile.
function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <Slot fit="bleed">
      <Svg width={SIZE} height={SIZE} viewBox="0 0 26 26">
        {children}
      </Svg>
    </Slot>
  );
}

const TIKTOK_NOTE =
  'M14.4 6.6v8.2a2.5 2.5 0 1 1-2.1-2.5v-2.3a4.8 4.8 0 1 0 4.4 4.8V10c.8.6 1.8 1 2.9 1.1V8.8a3.9 3.9 0 0 1-2.9-2.2z';

const AppStoreMark = () => <Photo source={appStoreIcon} fit="bleed" />;
const RedditMark = () => <Photo source={redditIcon} fit="clip" />;
const InstagramMark = () => <Photo source={instagramIcon} fit="clip" />;

const FacebookMark = () => (
  <Glyph>
    <Circle cx={13} cy={13} r={13} fill="#1877F2" />
    <Path
      d="M14.6 21v-6.1h2.1l.4-2.5h-2.5v-1.6c0-.7.3-1.4 1.4-1.4h1.2V7.2c-.6-.1-1.3-.2-2-.2-2 0-3.3 1.2-3.3 3.4v1.9H9.7v2.5h2.2V21z"
      fill="#FFFFFF"
    />
  </Glyph>
);

const TikTokMark = () => (
  <Glyph>
    <Rect width={26} height={26} rx={6.5} fill="#010101" />
    <Path d={TIKTOK_NOTE} fill="#25F4EE" translateX={-0.7} translateY={0.4} />
    <Path d={TIKTOK_NOTE} fill="#FE2C55" translateX={0.5} translateY={-0.3} />
    <Path d={TIKTOK_NOTE} fill="#FFFFFF" />
  </Glyph>
);

// YouTube's mark is a WIDE rect, so it cannot fill a square the way the others
// do. It gets a soft red ground instead of being stretched or floated.
const YouTubeMark = () => (
  <Glyph>
    <Rect width={26} height={26} rx={6.5} fill="#FFEFEF" />
    <Rect x={3.6} y={7.8} width={18.8} height={10.4} rx={3.1} fill="#FF0000" />
    <Path d="M11.2 10.6l4.8 2.4-4.8 2.4z" fill="#FFFFFF" />
  </Glyph>
);

// Deliberately an app-style glyph, not a brand: "Friends" is word of mouth,
// not a channel we could ever buy.
const FriendsMark = () => (
  <Glyph>
    <Rect width={26} height={26} rx={6.5} fill="#F1EDFF" />
    <Circle cx={10.2} cy={10.4} r={2.6} fill="none" stroke="#7C5CFC" strokeWidth={1.7} />
    <Path
      d="M5.6 19c.5-2.6 2.3-4 4.6-4s4.1 1.4 4.6 4"
      fill="none"
      stroke="#7C5CFC"
      strokeWidth={1.7}
      strokeLinecap="round"
    />
    <Circle cx={17.6} cy={10.9} r={2.1} fill="none" stroke="#B5A3FD" strokeWidth={1.5} />
    <Path
      d="M15.9 14.7c2.6-.4 4.3 1 4.7 3.6"
      fill="none"
      stroke="#B5A3FD"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  </Glyph>
);

// The catch-all now carries a mark too. Without one its row started at the
// label while every row above started at a tile, so the left edge broke on
// the last line of the list.
const ElsewhereMark = () => (
  <Glyph>
    <Rect width={26} height={26} rx={6.5} fill="#EDEAE5" />
    <Circle cx={8} cy={13} r={1.5} fill="#8A8592" />
    <Circle cx={13} cy={13} r={1.5} fill="#8A8592" />
    <Circle cx={18} cy={13} r={1.5} fill="#8A8592" />
  </Glyph>
);

export const DISCOVERY_OPTIONS: ConvoOption<DiscoverySource>[] = [
  { label: 'App Store search', value: 'app_store', leading: <AppStoreMark /> },
  { label: 'Friends', value: 'friends', leading: <FriendsMark /> },
  { label: 'Reddit', value: 'reddit', leading: <RedditMark /> },
  // Facebook before Instagram, as shipped. The mockup had these two the other
  // way round; that was arbitrary in the mockup and is NOT a design call, so
  // the 2026-08-06 order stands.
  { label: 'Facebook', value: 'facebook', leading: <FacebookMark /> },
  { label: 'Instagram', value: 'instagram', leading: <InstagramMark /> },
  { label: 'TikTok', value: 'tiktok', leading: <TikTokMark /> },
  { label: 'YouTube', value: 'youtube', leading: <YouTubeMark /> },
  { label: 'Somewhere else', value: 'other', leading: <ElsewhereMark /> },
];

export interface DiscoverySourceScreenProps {
  progress: number;
  onBack?(): void;
  onAnswer(value: DiscoverySource): void;
}

export function DiscoverySourceScreen({ progress, onBack, onAnswer }: DiscoverySourceScreenProps) {
  return (
    <ConvoScreen<DiscoverySource>
      progress={progress}
      onBack={onBack}
      // Trimmed from "On it. Quick one while I set up —" AND dropped to the
      // aside scale. Both halves are needed: measured in Hanken against the
      // 337pt of body width, the trimmed line is still 334.4pt at the 29pt
      // default — one line by 2.6pt, and two lines the moment Dynamic Type
      // moves at all. At 20pt it is 224.6pt, and 273.4pt even at 120%.
      context="Quick one while I set up…"
      contextAside
      question="Where did you find us?"
      questionAccent
      sub="Helps us reach more people like you."
      layout="list"
      options={DISCOVERY_OPTIONS}
      onAnswer={onAnswer}
    />
  );
}
