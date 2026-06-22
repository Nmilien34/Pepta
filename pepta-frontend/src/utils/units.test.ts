import { describe, expect, it } from 'vitest';
import { convertBody, formatHeight, formatWeight, type BodyMeasure } from './units';

const imperial: BodyMeasure = { units: 'imperial', height: 66, weight: 184 };

describe('units', () => {
  it('converts imperial to metric (rounded)', () => {
    expect(convertBody(imperial, 'metric')).toEqual({ units: 'metric', height: 168, weight: 83 });
  });

  it('converts metric to imperial (rounded)', () => {
    expect(convertBody({ units: 'metric', height: 168, weight: 83 }, 'imperial')).toEqual({
      units: 'imperial',
      height: 66,
      weight: 183,
    });
  });

  it('is a no-op when already in the target system', () => {
    expect(convertBody(imperial, 'imperial')).toBe(imperial);
  });

  it('formats height and weight per system', () => {
    expect(formatHeight(imperial)).toBe("5'6\"");
    expect(formatHeight({ units: 'metric', height: 168, weight: 83 })).toBe('168 cm');
    expect(formatWeight(imperial)).toBe('184 lb');
    expect(formatWeight({ units: 'metric', height: 168, weight: 83 })).toBe('83 kg');
  });
});
