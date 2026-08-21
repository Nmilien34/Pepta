// The card-header icon chip — the frame's `.ic`.
//
//   .ch i.ic, .ch svg.ic {
//     font-size: 18px; width: 1em; height: 1em;
//     padding: 8.5px; border-radius: 11px;
//     background: color-mix(in srgb, currentColor 13%, transparent);
//   }
//
// Every card header in the frame wears one, tinted with the card's OWN accent
// at 13%. The app shipped bare glyphs on all of them, which is why Home read
// flatter and lighter than the design everywhere at once: the chips are what
// give each card its colour identity before you read a word of it.
//
// This exists as a component rather than a copied style block because it was
// copied-and-dropped once already. `color-mix` has no React Native equivalent,
// so the tint is composed here from the accent plus an alpha — one place to be
// wrong instead of six.

import React from 'react';
import { View } from 'react-native';
import { Icon } from './Icon';
import { tint } from '../theme/tint';

export interface CardIconProps {
  name: string;
  /** The card's accent. Both the glyph and — at 13% — the chip behind it. */
  color: string;
  /** 18px in the frame; the weight card and the nutrient cards all use it. */
  size?: number;
  stroke?: number;
}

export function CardIcon({ name, color, size = 18, stroke = 2.3 }: CardIconProps) {
  return (
    <View
      style={{
        // 8.5 of padding around an 18px glyph — a 35pt box, per the frame.
        padding: 8.5,
        borderRadius: 11,
        backgroundColor: tint(color),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} size={size} color={color} stroke={stroke} />
    </View>
  );
}
