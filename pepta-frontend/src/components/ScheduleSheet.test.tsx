import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleSheet } from "./ScheduleSheet";

const mocks = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
}));

vi.mock("react-native", () => ({
  Pressable: ({
    children,
    ...props
  }: {
    children?:
      | React.ReactNode
      | ((state: { pressed: boolean }) => React.ReactNode);
  }) =>
    React.createElement(
      "Pressable",
      props,
      typeof children === "function" ? children({ pressed: false }) : children,
    ),
  View: "View",
}));

vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock("../theme", () => ({
  useTheme: () => ({
    colors: {
      border: "#eee",
      fiber: "#34C759",
      onPrimary: "#fff",
      primary: "#7C5CFC",
      surfaceAlt: "#f4f4f5",
      textPrimary: "#111",
      textSecondary: "#666",
      textTertiary: "#999",
    },
  }),
}));

vi.mock("../context/PeptaDataContext", () => ({
  usePeptaData: () => mocks.data,
}));

vi.mock("./AppText", () => ({
  AppText: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
}));

vi.mock("./BottomSheet", () => ({
  BottomSheet: ({
    visible,
    children,
    ...props
  }: {
    visible: boolean;
    children?: React.ReactNode;
  }) => (visible ? React.createElement("BottomSheet", props, children) : null),
}));

vi.mock("./Icon", () => ({
  Icon: (props: { name: string }) => React.createElement("Icon", props),
}));

// The design-lab story, pinned: today = Wed Jun 24 2026, cycle Jun 1 + 8on/2off
// (rest Jul 27 – Aug 9), Saturday schedule, Fridays logged earlier in June.
const TODAY = new Date("2026-06-24T12:00:00.000Z");

function seedData() {
  mocks.data.home = {
    activeCompounds: [
      { id: "c1", name: "Tirzepatide", plannedDose: 5, doseUnit: "mg" },
    ],
  };
  mocks.data.track = {
    doseLogs: [
      { id: "d1", compoundId: "c1", amount: 5, unit: "mg", datetime: "2026-06-05T12:00:00.000Z" },
      { id: "d2", compoundId: "c1", amount: 5, unit: "mg", datetime: "2026-06-12T12:00:00.000Z" },
    ],
  };
  mocks.data.schedules = [
    {
      id: "s1",
      compoundId: "c1",
      frequency: "weekly",
      daysOfWeek: [6],
      nextDoseAt: "2026-06-27T12:00:00.000Z",
      active: true,
    },
  ];
  mocks.data.cycles = [
    {
      id: "cy1",
      name: "My cycle",
      compoundIds: ["c1"],
      startDate: "2026-06-01",
      active: true,
      weeksOn: 8,
      weeksOff: 2,
      repeats: true,
    },
  ];
}

function cellByLabel(root: ReactTestInstance, label: string): ReactTestInstance {
  const matches = root.findAll(
    (node) => node.type === "Pressable" && node.props.accessibilityLabel === label,
  );
  expect(matches.length).toBe(1);
  return matches[0]!;
}

function dotColorOf(cell: ReactTestInstance): string {
  // The dot is the last View inside the cell.
  const views = cell.findAll((n) => n.type === "View");
  const dot = views[views.length - 1]!;
  return (dot.props as { style: { backgroundColor: string } }).style.backgroundColor;
}

function textOf(node: ReactTestInstance): string {
  return node
    .findAll((n) => n.type === "Text")
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children ?? "")))
    .join(" ");
}

describe("ScheduleSheet", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    seedData();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function render(onEditCycle = vi.fn()) {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ScheduleSheet visible onClose={vi.fn()} onEditCycle={onEditCycle} />,
      );
    });
    return { root: renderer.root, onEditCycle };
  }

  it("marks the June grid: logged Fridays green, due Saturday purple, today highlighted", () => {
    const { root } = render();

    expect(dotColorOf(cellByLabel(root, "Fri, Jun 5"))).toBe("#34C759");
    expect(dotColorOf(cellByLabel(root, "Fri, Jun 12"))).toBe("#34C759");
    // Upcoming Saturday is due; past Saturdays show nothing.
    expect(dotColorOf(cellByLabel(root, "Sat, Jun 27"))).toBe("#7C5CFC");
    expect(dotColorOf(cellByLabel(root, "Sat, Jun 20"))).toBe("transparent");
  });

  it("paints the continuous rest band with rounded window ends (July)", () => {
    const { root } = render();
    // Navigate June → July.
    const next = root.findAll(
      (node) => node.type === "Pressable" && node.props.accessibilityLabel === "Next month",
    )[0]!;
    act(() => next.props.onPress());

    const restStart = cellByLabel(root, "Mon, Jul 27");
    const startStyle = restStart.props.style as Record<string, unknown>;
    expect(startStyle.backgroundColor).toBe("rgba(52,199,89,0.09)");
    expect(startStyle.borderTopLeftRadius).toBe(10);
    // Mid-window cell: band continues, no left rounding (Tue Jul 28).
    const mid = cellByLabel(root, "Tue, Jul 28");
    const midStyle = mid.props.style as Record<string, unknown>;
    expect(midStyle.backgroundColor).toBe("rgba(52,199,89,0.09)");
    expect(midStyle.borderTopLeftRadius).toBe(0);
    // On-cycle day before the window has no band.
    expect((cellByLabel(root, "Sun, Jul 26").props.style as Record<string, unknown>).backgroundColor).toBe("transparent");
    // Due dots are suppressed inside rest (Sat Aug 1 is in the band).
    expect(dotColorOf(cellByLabel(root, "Sat, Aug 1"))).toBe("transparent");
  });

  it("day detail: due Saturday reads as a shot day, rest day announces the pause", () => {
    const { root } = render();

    act(() => cellByLabel(root, "Sat, Jun 27").props.onPress());
    expect(textOf(root)).toContain("Shot day — 5 mg Tirzepatide");

    const next = root.findAll(
      (node) => node.type === "Pressable" && node.props.accessibilityLabel === "Next month",
    )[0]!;
    act(() => next.props.onPress());
    act(() => cellByLabel(root, "Tue, Jul 28").props.onPress());
    const text = textOf(root);
    expect(text).toContain("Rest day — no doses scheduled.");
    expect(text).toContain("Back on Aug 10");
  });

  it("cycle row shows the pattern and Edit fires onEditCycle", () => {
    const { root, onEditCycle } = render();
    expect(textOf(root)).toContain("Cycle · 8 wk on, 2 off");
    const edit = root.findAll(
      (node) => node.type === "Pressable" && node.props.accessibilityLabel === "Edit cycle",
    )[0]!;
    act(() => edit.props.onPress());
    expect(onEditCycle).toHaveBeenCalledTimes(1);
  });

  it("without a cycle the row invites setup instead", () => {
    mocks.data.cycles = [];
    const { root } = render();
    expect(textOf(root)).toContain("Set up an on/off cycle");
  });
});
