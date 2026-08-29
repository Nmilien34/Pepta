// AppsFlyer must not send the install event before ATT is answered.
//
// THE BUG, found 2026-08-28. initSdk was called with `manualStart: true` —
// exactly the right tool, because with it initSdk does NOT send the install,
// startSdk does. Then the very next line called startSdk(). So the install
// went out before the ATT dialog had even been REQUESTED, carrying no IDFA no
// matter what the user later chose. Every Facebook install degraded to
// organic, and nothing looked broken.
//
// Effect ordering made it certain rather than merely likely: AppsFlyer
// initialises from AuthProvider's mount effect and ATT from App.tsx's, and
// React runs child effects before parent effects. That ordering is now
// irrelevant — the dependency is explicit and awaited.
import { describe, expect, it, vi } from 'vitest';
import { createAppsFlyerService } from './appsflyer';

function client(order: string[]) {
  return {
    initSdk: vi.fn((_o: unknown, success?: () => void) => {
      order.push('initSdk');
      success?.();
    }),
    startSdk: vi.fn(() => order.push('startSdk')),
    setCustomerUserId: vi.fn((_u: string, s?: () => void) => s?.()),
    logEvent: vi.fn((_n: string, _v: unknown, s?: () => void) => s?.()),
    getAppsFlyerUID: vi.fn((cb: (e: unknown, uid?: string) => void) => cb(null, 'uid')),
    disableSKAD: vi.fn(),
    stop: vi.fn(),
  };
}

describe('the install event waits for ATT', () => {
  it('does not start the SDK until ATT has settled', async () => {
    const order: string[] = [];
    let settle!: () => void;
    const attSettled = new Promise<void>((r) => {
      settle = () => {
        order.push('att-settled');
        r();
      };
    });

    const native = client(order);
    const service = createAppsFlyerService({
      devKey: 'k',
      appId: '1',
      loadNativeClient: async () => native as never,
      requestTrackingPermissions: async () => ({ status: 'denied', granted: false }),
      isTrackingTransparencyAvailable: () => true,
      waitForAttSettled: () => attSettled,
    } as never);

    const running = service.initialize('user-1');
    // Give initSdk every chance to run and, if the bug were present, to call
    // startSdk on the next line.
    await new Promise((r) => setTimeout(r, 20));
    // GUARD: without this, "startSdk was not called" also passes when the
    // service bailed out before initialising at all — a vacuous green.
    expect(native.initSdk).toHaveBeenCalledTimes(1);
    expect(native.startSdk).not.toHaveBeenCalled();

    settle();
    await running;

    expect(native.startSdk).toHaveBeenCalledTimes(1);
    // The ordering is the assertion. startSdk BEFORE att-settled is the bug.
    expect(order.indexOf('att-settled')).toBeLessThan(order.indexOf('startSdk'));
  });

  it('starts anyway once the wait times out, rather than never attributing', async () => {
    const order: string[] = [];
    const native = client(order);
    const service = createAppsFlyerService({
      devKey: 'k',
      appId: '1',
      loadNativeClient: async () => native as never,
      requestTrackingPermissions: async () => ({ status: 'denied', granted: false }),
      isTrackingTransparencyAvailable: () => true,
      // Never settles: a user who ignores the dialog must not block the SDK
      // forever, or the install is lost entirely.
      waitForAttSettled: () => new Promise<void>(() => {}),
      attWaitTimeoutMs: 30,
    } as never);

    await service.initialize('user-1');
    expect(native.initSdk).toHaveBeenCalledTimes(1);
    expect(native.startSdk).toHaveBeenCalledTimes(1);
  });

  it('passes timeToWaitForATTUserAuthorization to the native SDK', async () => {
    const order: string[] = [];
    const native = client(order);
    const service = createAppsFlyerService({
      devKey: 'k',
      appId: '1',
      loadNativeClient: async () => native as never,
      requestTrackingPermissions: async () => ({ status: 'denied', granted: false }),
      isTrackingTransparencyAvailable: () => true,
      waitForAttSettled: () => Promise.resolve(),
    } as never);

    await service.initialize('user-1');
    // Declared in our own interface since day one and never passed. The native
    // SDK has its own ATT wait; ours gates startSdk. Both, deliberately.
    const options = native.initSdk.mock.calls[0]![0] as Record<string, unknown>;
    expect(options.timeToWaitForATTUserAuthorization).toBe(60);
  });
});
