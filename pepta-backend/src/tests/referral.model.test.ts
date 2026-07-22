import { describe, expect, it } from "vitest";
import * as synchronizedModels from "../models";
import {
  ReferralClaimModel,
  ReferralCodeModel,
} from "../models/referral.model";

describe("referral model registration", () => {
  it("includes referral models in the startup index synchronization registry", () => {
    const registeredModels = Object.values(synchronizedModels);

    expect(registeredModels).toContain(ReferralCodeModel);
    expect(registeredModels).toContain(ReferralClaimModel);
  });
});
