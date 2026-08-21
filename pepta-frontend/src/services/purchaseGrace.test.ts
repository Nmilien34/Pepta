// The grace window exists because a StoreKit-confirmed purchase outruns the
// RevenueCat webhook the backend needs before resolveAccess can say 'active'.
// It must open on purchase, admit within its bound, and close honestly after.

import { describe, expect, it } from "vitest";
import {
  clearPurchaseGrace,
  hasPurchaseGrace,
  markPurchaseSuccess,
  PURCHASE_GRACE_MS,
} from "./purchaseGrace";

describe("purchaseGrace", () => {
  it("opens on a confirmed purchase and admits within the bound", () => {
    const now = 1_000_000;
    markPurchaseSuccess("user-1", now);
    expect(hasPurchaseGrace("user-1", now)).toBe(true);
    expect(hasPurchaseGrace("user-1", now + PURCHASE_GRACE_MS - 1)).toBe(true);
    clearPurchaseGrace();
  });

  it("expires at the bound — a webhook that never lands closes the gate again", () => {
    const now = 2_000_000;
    markPurchaseSuccess("user-1", now);
    expect(hasPurchaseGrace("user-1", now + PURCHASE_GRACE_MS)).toBe(false);
    clearPurchaseGrace();
  });

  it("clears when the backend catches up with a real active decision", () => {
    const now = 3_000_000;
    markPurchaseSuccess("user-1", now);
    clearPurchaseGrace();
    expect(hasPurchaseGrace("user-1", now)).toBe(false);
  });

  it("is closed by default — never grants without a confirmed purchase", () => {
    clearPurchaseGrace();
    expect(hasPurchaseGrace("user-1")).toBe(false);
  });
});
