import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeResponse, User } from "@pepta/shared";
import { AccountDetailsScreen } from "./AccountDetailsScreen";

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  deleteAccount: vi.fn(() => Promise.resolve()),
  goBack: vi.fn(),
  home: null as HomeResponse | null,
  logout: vi.fn(),
  refreshHome: vi.fn(() => Promise.resolve()),
  updateAccount: vi.fn(),
  updateCachedUser: vi.fn(),
  user: null as User | null,
}));

vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
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
  ScrollView: "ScrollView",
  Text: "Text",
  TextInput: ({
    value,
    onChangeText,
    ...props
  }: {
    value?: string;
    onChangeText?: (value: string) => void;
  }) => React.createElement("TextInput", { value, onChangeText, ...props }),
  View: "View",
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
}));

vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mocks.goBack }),
}));

vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fafafa",
      border: "#eee",
      danger: "#dc2626",
      primary: "#8B5CF6",
      primaryGradientEnd: "#A855F7",
      primaryGradientStart: "#8B5CF6",
      protein: "#f97316",
      surface: "#fff",
      surfaceAlt: "#f4f4f5",
      textPrimary: "#111",
      textSecondary: "#666",
      textTertiary: "#999",
    },
    radii: { pill: 999 },
    shadows: { card: {} },
    sizes: { card: { borderRadius: 24 } },
    spacing: { lg: 20 },
  }),
}));

vi.mock("../../components", () => ({
  AppText: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("Text", null, children),
  Card: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("View", null, children),
  EditableAvatar: () => React.createElement("EditableAvatar"),
}));

vi.mock("../../components/Icon", () => ({
  Icon: "Icon",
}));

vi.mock("../../components/BottomSheet", () => ({
  BottomSheet: ({
    visible,
    children,
  }: {
    visible: boolean;
    children?: React.ReactNode;
  }) => (visible ? React.createElement("BottomSheet", null, children) : null),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: mocks.user,
    logout: mocks.logout,
    updateCachedUser: mocks.updateCachedUser,
  }),
}));

vi.mock("../../context/PeptaDataContext", () => ({
  usePeptaData: () => ({
    home: mocks.home,
    refreshHome: mocks.refreshHome,
  }),
}));

vi.mock("../../services/api", () => ({
  api: {
    deleteAccount: mocks.deleteAccount,
    updateAccount: mocks.updateAccount,
  },
}));

function nodeText(node: ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string" ? child : nodeText(child as ReactTestInstance),
    )
    .join("");
}

function pressableContaining(
  root: TestRenderer.ReactTestRenderer["root"],
  text: string,
): ReactTestInstance {
  const match = root
    .findAll(
      (node) =>
        typeof node.props.onPress === "function" &&
        nodeText(node).includes(text),
    )
    .at(0);
  if (!match) throw new Error(`No Pressable containing "${text}"`);
  return match;
}

function user(): User {
  return {
    id: "u1",
    email: "nick@pepta.app",
    emailVerified: true,
    displayName: "Nick Pepta",
    authProviders: [
      {
        provider: "google",
        providerUserId: "google-user-1",
        linkedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    onboardingComplete: true,
    entitlement: { status: "free", expiresAt: null, willRenew: false },
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z",
  } as User;
}

function home(): HomeResponse {
  return {
    activeCompounds: [
      {
        id: "compound-1",
        userId: "u1",
        name: "Mounjaro",
        drugClass: "dual_glp_1_gip",
        route: "injection",
        halfLifeDays: 5,
        doseUnit: "mg",
        plannedDose: 2.5,
        startDate: "2026-06-01",
        status: "active",
        deletedAt: null,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      },
    ],
    medicationLevels: [],
    nextDose: {
      compoundId: "compound-1",
      compoundName: "Mounjaro",
      nextDoseAt: "2026-06-30T14:00:00.000Z",
      hoursUntilNextDose: 72,
    },
    profile: null,
    sectionErrors: {},
    setupProgress: { loggedItems: 0, required: 4, unlocked: false },
    streakDays: 0,
    todayCalories: 0,
    todayFiberGrams: 0,
    todayProteinGrams: 0,
    todayWaterOz: 0,
    latestWeight: null,
    insights: [],
    weeklyRetention: null,
    selectedRange: "today",
  } as unknown as HomeResponse;
}

describe("AccountDetailsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteAccount.mockResolvedValue(undefined);
    mocks.home = home();
    mocks.user = user();
  });

  it("shows full account details, medication context, joined date, and delete action", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<AccountDetailsScreen />);
    });

    const text = nodeText(tree!.root);
    expect(text).toContain("Account");
    expect(text).toContain("Nick Pepta");
    expect(text).toContain("nick@pepta.app");
    expect(text).toContain("Mounjaro");
    expect(text).toContain("2.5 mg");
    expect(text).toContain("Joined Jun 1, 2026");
    expect(text).toContain("Free plan");
    expect(text).toContain("Delete account");
  });

  it("confirms and deletes the account through the backend, then logs out locally", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<AccountDetailsScreen />);
    });

    await act(async () => {
      pressableContaining(tree!.root, "Delete account").props.onPress();
    });

    const buttons = mocks.alert.mock.calls[0]?.[2] as
      | Array<{ text: string; style?: string; onPress?: () => void }>
      | undefined;
    const deleteButton = buttons?.find(
      (button) => button.style === "destructive",
    );
    expect(deleteButton?.text).toBe("Delete account");

    await act(async () => {
      await deleteButton?.onPress?.();
    });

    expect(mocks.deleteAccount).toHaveBeenCalledTimes(1);
    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });
});
