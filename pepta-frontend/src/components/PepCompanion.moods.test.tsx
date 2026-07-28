// Wire-level guard for the two halves of the mood system that used to be
// dead: the mood LINES (returned by buildPepMood since the companion shipped,
// never surfaced) and the 'celebrating' mood (unreachable — nothing ever
// passed milestone: true). These mount the real PepCompanion and assert the
// deck order, the pose, and the once-only milestone marking.

import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  data: { home: null as unknown, cycles: [] as unknown[] },
  seen: new Set<string>(),
  markMilestoneSeen: vi.fn(async (_key: string) => undefined),
}));

vi.mock("react-native", () => ({
  Animated: {
    Value: vi.fn(() => ({ interpolate: vi.fn(() => "interpolated"), setValue: vi.fn() })),
    View: "Animated.View",
    spring: vi.fn(() => ({ start: vi.fn() })),
    timing: vi.fn(() => ({ start: vi.fn() })),
    sequence: vi.fn(() => ({ start: vi.fn() })),
    loop: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  },
  Easing: { inOut: vi.fn((v: unknown) => v), out: vi.fn((v: unknown) => v), quad: "quad" },
  Platform: { OS: "ios" },
  Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Pressable", props, children),
  View: "View",
}));
vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(() => Promise.resolve()),
  selectionAsync: vi.fn(() => Promise.resolve()),
  notificationAsync: vi.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Soft: "soft", Light: "light", Medium: "medium", Rigid: "rigid", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success" },
}));
vi.mock("../theme", () => ({
  useTheme: () => ({
    colors: {
      surface: "#fff", border: "#eee", primary: "#7C5CFC", textTertiary: "#999",
    },
    shadows: { card: {} },
  }),
}));
vi.mock("./AppText", () => ({
  AppText: ({ children }: { children?: React.ReactNode }) => React.createElement("AppText", null, children),
}));
vi.mock("./Icon", () => ({ Icon: () => null }));
vi.mock("./Mascot", () => ({
  Mascot: ({ pose }: { pose: string }) => React.createElement("Mascot", { pose }),
}));
vi.mock("../context/PeptaDataContext", () => ({
  usePeptaData: () => ({ home: mocks.data.home, cycles: mocks.data.cycles }),
}));
vi.mock("../context/LogSheetsContext", () => ({
  useLogSheets: () => ({ openMeal: vi.fn(), openQuickLog: vi.fn() }),
}));
vi.mock("../context/PepChatContext", () => ({
  usePepChat: () => ({ askPep: vi.fn() }),
}));
vi.mock("../services/api", () => ({
  api: { getCoachNotes: vi.fn(async () => []) },
}));
vi.mock("../services/aiConsent", () => ({
  hasAIDataSharingConsent: vi.fn(async () => false),
}));
// Local notes empty so the deck holds exactly the notes under test.
vi.mock("../screens/app/companionNotes", () => ({
  buildCompanionNotes: () => [],
}));
vi.mock("../services/pepMilestoneStore", () => ({
  readSeenMilestones: vi.fn(async () => mocks.seen),
  markMilestoneSeen: mocks.markMilestoneSeen,
}));

import { PepCompanion } from "./PepCompanion";

const level = (currentEstimate: number) => ({
  currentEstimate,
  peakEstimate: 10,
  troughEstimate: 1,
});

const home = (over: Record<string, unknown> = {}) => ({
  medicationLevels: [level(1.5)], // fraction ~0.06 → drowsy
  setupProgress: { loggedItems: 0, required: 3, unlocked: false },
  streakDays: 0,
  profile: null,
  ...over,
});

function nodeText(node: ReactTestInstance): string {
  return node.children
    .map((c) => (typeof c === "string" ? c : nodeText(c as ReactTestInstance)))
    .join("");
}

async function mount() {
  vi.useFakeTimers();
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<PepCompanion />);
  });
  // auto-greet timer
  await act(async () => {
    vi.runOnlyPendingTimers();
  });
  vi.useRealTimers();
  return tree;
}

const poseOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAll((n) => String(n.type) === "Mascot")[0]?.props.pose;

describe("mood lines reach the bubble", () => {
  beforeEach(() => {
    mocks.seen = new Set();
    mocks.markMilestoneSeen.mockClear();
  });

  it("drowsy Pep actually says shot day is close", async () => {
    mocks.data.home = home();
    const tree = await mount();
    expect(poseOf(tree)).toBe("drowsy");
    expect(nodeText(tree.root)).toContain("Shot day is close.");
  });

  it("stays quiet at steady — an empty deck hides the companion entirely", async () => {
    // steady has no line, local notes are mocked empty, no milestone is due:
    // the deck is empty and PepCompanion renders null. That is the designed
    // behavior — Pep only appears when there is something to say.
    mocks.data.home = home({ medicationLevels: [level(5)] });
    const tree = await mount();
    expect(tree.toJSON()).toBeNull();
  });
});

describe("milestones make celebrating reachable", () => {
  beforeEach(() => {
    mocks.seen = new Set();
    mocks.markMilestoneSeen.mockClear();
  });

  it("cheers a due milestone, leads the deck with it, and marks it seen once", async () => {
    mocks.data.home = home({
      setupProgress: { loggedItems: 3, required: 3, unlocked: true },
    });
    const tree = await mount();
    // The cheer outranks the drowsy level for the session it fires in.
    expect(poseOf(tree)).toBe("cheer");
    // The auto-greet opens on the celebration, not the mood line.
    expect(nodeText(tree.root)).toContain("That’s your setup done.");
    expect(mocks.markMilestoneSeen).toHaveBeenCalledTimes(1);
    expect(mocks.markMilestoneSeen).toHaveBeenCalledWith("setup_unlocked");
  });

  it("never replays a seen milestone", async () => {
    mocks.seen = new Set(["setup_unlocked"]);
    mocks.data.home = home({
      setupProgress: { loggedItems: 3, required: 3, unlocked: true },
    });
    const tree = await mount();
    expect(poseOf(tree)).toBe("drowsy"); // back to the curve
    expect(mocks.markMilestoneSeen).not.toHaveBeenCalled();
    expect(nodeText(tree.root)).not.toContain("That’s your setup done.");
  });
});
