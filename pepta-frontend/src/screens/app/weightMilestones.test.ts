import { describe, expect, it } from 'vitest';
import { buildMilestoneTrack, milestoneLabel, milestoneStep } from './weightMilestones';

describe('buildMilestoneTrack', () => {
  it('walks down in round numbers from below the current weight', () => {
    const t = buildMilestoneTrack(199.5, 170, 'lb');
    expect(t.markers).toEqual([195, 190, 185, 180, 175]);
    expect(t.next).toBe(195);
    expect(t.goal).toBe(170);
  });

  it('turns 29.5 lb away into 4.5 lb away — the whole point', () => {
    const t = buildMilestoneTrack(199.5, 170, 'lb');
    expect(t.toNext).toBe(4.5);
    expect(milestoneLabel(t, 'lb')).toBe('4.5 lb to go');
  });

  it('never lands a marker ON the current weight', () => {
    // 195.0 exactly: the next mark is 190, not the number they are standing on.
    const t = buildMilestoneTrack(195, 170, 'lb');
    expect(t.markers[0]).toBe(190);
    expect(t.toNext).toBe(5);
  });

  it('never places a marker at or past the goal — the flag is separate', () => {
    const t = buildMilestoneTrack(178, 170, 'lb');
    expect(t.markers.every((m) => m > 170)).toBe(true);
    expect(t.markers).toEqual([175]);
  });

  it('counts to the goal itself once no markers remain', () => {
    const t = buildMilestoneTrack(172, 170, 'lb');
    expect(t.markers).toEqual([]);
    expect(t.next).toBeNull();
    expect(t.toNext).toBe(2);
    expect(milestoneLabel(t, 'lb')).toBe('2 lb to go');
  });

  it('reports reached at or past the goal, and never a negative distance', () => {
    // Overshooting needs the START weight: 168 with a 170 goal is a finished
    // loss or an unfinished gain, and only the start says which.
    for (const w of [170, 168]) {
      const t = buildMilestoneTrack(w, 170, 'lb', { start: 199.5 });
      expect(t.reached).toBe(true);
      expect(t.toNext).toBeGreaterThanOrEqual(0);
      expect(milestoneLabel(t, 'lb')).toBe('Goal reached');
    }
  });

  it('uses a 2 kg grid in metric', () => {
    expect(milestoneStep('kg')).toBe(2);
    const t = buildMilestoneTrack(90.5, 77, 'kg');
    expect(t.markers).toEqual([90, 88, 86, 84, 82]);
    expect(milestoneLabel(t, 'kg')).toBe('0.5 kg to go');
  });

  it('shows the flag alone when the goal is ABOVE the current weight', () => {
    // Gaining: "next marker 185" would read as a target to hit, not to pass.
    const t = buildMilestoneTrack(170, 185, 'lb', { start: 165 });
    expect(t.markers).toEqual([]);
    expect(t.next).toBeNull();
    expect(t.toNext).toBe(15);
    expect(t.reached).toBe(false);
  });

  it('caps the track so a long journey does not render fifty dots', () => {
    const t = buildMilestoneTrack(300, 170, 'lb');
    expect(t.markers).toHaveLength(5);
  });
});

describe('direction', () => {
  it('treats an overshot loss as reached, not as an unfinished gain', () => {
    const finished = buildMilestoneTrack(168, 170, 'lb', { start: 199.5 });
    expect(finished.reached).toBe(true);
    // Same numbers, opposite journey.
    const gaining = buildMilestoneTrack(168, 170, 'lb', { start: 160 });
    expect(gaining.reached).toBe(false);
    expect(gaining.toNext).toBe(2);
  });
});
