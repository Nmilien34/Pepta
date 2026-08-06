// Onboarding — "Where did you find us?" (step 7, design-lab/where-found-us.html
// rev 4). A spoken convo turn: tap → sent bubble (logo riding along) →
// auto-advance. Sits right after fearAnswered — the user just received their
// worry answered, so the one ask that serves US lands at a trust peak — and
// before the skip-gated medication block, so every journey stage gets asked.
// The next screen (medication) is UNTOUCHED: no echo lines, the sent-bubble
// beat is the whole acknowledgment (Nick, rev 4).
//
// The six sources shuffle per mount to kill position bias; "Somewhere else"
// always renders last as the honest catch-all (a forced six-way pick inflates
// every listed channel). Apple + Instagram are the supplied brand assets;
// Facebook/TikTok/YouTube are drawn with react-native-svg; Friends is
// deliberately an app-style glyph, not a brand mark.

import React, { useRef } from 'react';
import { Image, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { DiscoverySource } from '@pepta/shared';
import { ConvoScreen, type ConvoOption } from '../../components';
import appleLogo from '../../../assets/discovery-apple.png';
import instagramLogo from '../../../assets/discovery-instagram.png';

export interface DiscoverySourceScreenProps {
  progress: number;
  onBack?(): void;
  onAnswer(value: DiscoverySource): void;
}

const TILE = { width: 26, height: 26, borderRadius: 8, overflow: 'hidden' as const };

function AppStoreLogo() {
  return <Image source={appleLogo} style={TILE} resizeMode="contain" />;
}

function InstagramLogo() {
  return <Image source={instagramLogo} style={TILE} resizeMode="contain" />;
}

function FacebookLogo() {
  return (
    <Svg width={26} height={26} viewBox="0 0 26 26">
      <Circle cx={13} cy={13} r={13} fill="#1877F2" />
      <Path
        d="M14.6 21v-6.1h2.1l.4-2.5h-2.5v-1.6c0-.7.3-1.4 1.4-1.4h1.2V7.2c-.6-.1-1.3-.2-2-.2-2 0-3.3 1.2-3.3 3.4v1.9H9.7v2.5h2.2V21z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

const TIKTOK_NOTE =
  'M14.4 6.6v8.2a2.5 2.5 0 1 1-2.1-2.5v-2.3a4.8 4.8 0 1 0 4.4 4.8V10c.8.6 1.8 1 2.9 1.1V8.8a3.9 3.9 0 0 1-2.9-2.2z';

function TikTokLogo() {
  return (
    <Svg width={26} height={26} viewBox="0 0 26 26">
      <Rect width={26} height={26} rx={6.5} fill="#010101" />
      <Path d={TIKTOK_NOTE} fill="#25F4EE" translateX={-0.7} translateY={0.4} />
      <Path d={TIKTOK_NOTE} fill="#FE2C55" translateX={0.5} translateY={-0.3} />
      <Path d={TIKTOK_NOTE} fill="#FFFFFF" />
    </Svg>
  );
}

function YouTubeLogo() {
  return (
    <Svg width={26} height={26} viewBox="0 0 26 26">
      <Rect x={1} y={4.5} width={24} height={17} rx={5} fill="#FF0000" />
      <Path d="M10.8 9.4l6.4 3.6-6.4 3.6z" fill="#FFFFFF" />
    </Svg>
  );
}

function FriendsGlyph() {
  return (
    <Svg width={26} height={26} viewBox="0 0 26 26">
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
    </Svg>
  );
}

/** White tile behind transparent marks so they read on the chip and the bubble. */
function Tile({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: 8,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

const BRAND_OPTIONS: ConvoOption<DiscoverySource>[] = [
  { label: 'App Store search', value: 'app_store', leading: <Tile><AppStoreLogo /></Tile> },
  { label: 'Instagram', value: 'instagram', leading: <Tile><InstagramLogo /></Tile> },
  { label: 'Facebook', value: 'facebook', leading: <Tile><FacebookLogo /></Tile> },
  { label: 'TikTok', value: 'tiktok', leading: <Tile><TikTokLogo /></Tile> },
  { label: 'YouTube', value: 'youtube', leading: <Tile><YouTubeLogo /></Tile> },
  { label: 'Friends', value: 'friends', leading: <Tile><FriendsGlyph /></Tile> },
];

/** The six brands shuffled (position bias), "Somewhere else" always last. */
export function buildDiscoveryOptions(
  random: () => number = Math.random,
): ConvoOption<DiscoverySource>[] {
  const shuffled = [...BRAND_OPTIONS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return [...shuffled, { label: 'Somewhere else', value: 'other' }];
}

export function DiscoverySourceScreen({ progress, onBack, onAnswer }: DiscoverySourceScreenProps) {
  // Shuffle once per mount — chips must not reorder on re-render.
  const options = useRef(buildDiscoveryOptions()).current;
  return (
    <ConvoScreen<DiscoverySource>
      progress={progress}
      onBack={onBack}
      context="On it. Quick one while I set up —"
      question="Where did you find us?"
      questionAccent
      sub="Helps us reach more people like you."
      options={options}
      onAnswer={onAnswer}
    />
  );
}
