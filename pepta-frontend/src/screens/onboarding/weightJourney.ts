// The live line under the merged start+goal weight screen.
//
// Pure and RN-free so it unit-tests in plain Node — the same rule
// onboardingFlow.ts follows, and the reason this is not inline in the .tsx.

export type WeightUnit = 'lb' | 'kg';

/**
 * "24 lb down, 46 to go." — the one line neither screen could say alone, and
 * the reason the merge is worth more than the screen it saves.
 *
 * Each half is dropped when it would be a lie: no "down" when they have not
 * lost anything, no "to go" when they are already at or past the goal.
 */
export function journeyLine(
  startWeight: number,
  currentWeight: number,
  goalWeight: number,
  unit: WeightUnit,
  showStart: boolean,
): string | null {
  const parts: string[] = [];
  const lost = Math.round(startWeight - currentWeight);
  if (showStart && lost > 0) parts.push(`${lost} ${unit} down`);
  const toGo = Math.round(currentWeight - goalWeight);
  if (toGo > 0) parts.push(`${toGo} to go`);
  if (parts.length === 0) return null;
  return `${parts.join(', ')}.`;
}

