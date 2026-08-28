// App Review 2.1(a), rejection of 2026-08-28, on an iPad Air 11-inch (M3):
// "The app was not responsive when we tapped on the option for 'Sync Apple
//  Health'."
//
// HOW IT WAS SILENT. AccountScreen wired the row as
// `onPress: () => void toggleHealthSync()`. `void` DISCARDS the promise, so a
// resolved `false` produced an alert but a THROW produced nothing at all —
// no alert, no state change, no log the user could see. iPadOS does not
// support HealthKit, so `kit.Constants.Permissions` is reached on a module
// that never initialised and the handler throws before any alert can fire.
//
// The gap was that nothing ever ASKED whether HealthKit exists here.
// react-native-health has exposed isAvailable() the whole time.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  initHealthKit: vi.fn(),
  constantsThrows: false,
}));

vi.mock('react-native-health', () => ({
  default: {
    isAvailable: (cb: (e: unknown, r: boolean) => void) => mocks.isAvailable(cb),
    initHealthKit: (p: unknown, cb: (e: unknown) => void) => mocks.initHealthKit(p, cb),
    get Constants() {
      // The iPad shape: the native module is absent, so reaching into it
      // throws rather than returning undefined.
      if (mocks.constantsThrows) throw new TypeError('null is not an object');
      return { Permissions: { Steps: 'Steps', StepCount: 'StepCount', Workout: 'Workout' } };
    },
  },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { setItem: vi.fn(async () => undefined), removeItem: vi.fn(async () => undefined), getItem: vi.fn(async () => null) },
}));

import { healthAvailability } from './healthSync';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.constantsThrows = false;
  mocks.isAvailable.mockImplementation((cb: (e: unknown, r: boolean) => void) => cb(null, true));
});

describe('HealthKit availability is asked, not assumed', () => {
  it('reports available when the platform says so', async () => {
    await expect(healthAvailability()).resolves.toBe('available');
  });

  it('reports unavailable on a device without HealthKit, rather than throwing', async () => {
    // This is the iPad case Apple tapped.
    mocks.isAvailable.mockImplementation((cb: (e: unknown, r: boolean) => void) => cb(null, false));
    await expect(healthAvailability()).resolves.toBe('unavailable');
  });

  it('reports unavailable when the native module throws on access', async () => {
    mocks.constantsThrows = true;
    mocks.isAvailable.mockImplementation(() => {
      throw new TypeError('null is not an object');
    });
    // NEVER a rejection: a throw here is what made the row dead.
    await expect(healthAvailability()).resolves.toBe('unavailable');
  });

  it('reports unavailable when the availability callback errors', async () => {
    mocks.isAvailable.mockImplementation((cb: (e: unknown, r: boolean) => void) =>
      cb(new Error('no module'), false),
    );
    await expect(healthAvailability()).resolves.toBe('unavailable');
  });
});
