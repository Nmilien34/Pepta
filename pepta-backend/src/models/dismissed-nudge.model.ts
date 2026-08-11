// One-time in-app nudges the user has dismissed ("Not now").
//
// Its OWN collection, for the same reason discoverySource has one: the
// client-facing response schemas are strict and bundled into shipped app
// builds, so a new key on HomeResponse would make stale clients reject the
// whole payload. This is read through its own endpoint instead.
//
// The key is "<nudge>:<subjectId>" — dismissal binds to the record the nudge
// was shown for, not to the account. A user who dismisses the prompt about one
// unidentified compound is still asked about a different one they create later.

import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";

export interface DismissedNudgeDocument extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  key: string;
  createdAt: Date;
  updatedAt: Date;
}

const dismissedNudgeSchema = new Schema<DismissedNudgeDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    key: { type: String, required: true },
  },
  { timestamps: true },
);

// Per user, per subject — and the uniqueness is what makes the dismiss
// endpoint idempotent under retry.
dismissedNudgeSchema.index({ userId: 1, key: 1 }, { unique: true });

export const DismissedNudgeModel = mongoose.model<DismissedNudgeDocument>(
  "DismissedNudge",
  dismissedNudgeSchema,
);
