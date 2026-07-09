import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HomeResponse,
  ProgressResponse,
  TrackResponse,
  User,
} from "@pepta/shared";
import { AccountScreen } from "./AccountScreen";

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  share: vi.fn((_content: { title: string; message: string }) =>
    Promise.resolve({}),
  ),
  navigate: vi.fn(),
  openSettings: vi.fn(() => Promise.resolve()),
  openURL: vi.fn(() => Promise.resolve()),
  getHome: vi.fn(),
  getTrack: vi.fn(),
  getProgress: vi.fn(),
  refreshHome: vi.fn(() => Promise.resolve()),
  updateAccount: vi.fn(),
  updateCachedUser: vi.fn(),
  updateProfileSettings: vi.fn(() => Promise.resolve({})),
  home: null as HomeResponse | null,
  track: null as TrackResponse | null,
  progress: null as ProgressResponse | null,
  user: null as User | null,
}));

vi.mock("react-native", () => ({
  Alert: {
    alert: mocks.alert,
  },
  Linking: {
    openSettings: mocks.openSettings,
    openURL: mocks.openURL,
  },
  Share: {
    share: mocks.share,
  },
  Modal: ({
    visible,
    children,
  }: {
    visible?: boolean;
    children?: React.ReactNode;
  }) => (visible ? React.createElement("Modal", { visible }, children) : null),
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

vi.mock("expo-linear-gradient", () => ({
  LinearGradient: "LinearGradient",
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: mocks.navigate,
  }),
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
  Reveal: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("View", null, children),
  UserAvatar: () => React.createElement("UserAvatar"),
}));

vi.mock("../../components/Icon", () => ({
  Icon: "Icon",
}));

vi.mock("../../components/BottomSheet", () => ({
  BottomSheet: ({
    visible,
    height,
    children,
  }: {
    visible: boolean;
    height?: string;
    children?: React.ReactNode;
  }) =>
    visible
      ? React.createElement(
          "BottomSheet",
          { testID: "settings-bottom-sheet", height },
          children,
        )
      : null,
}));

vi.mock("../onboarding/PaywallScreen", () => ({
  PaywallScreen: ({ onComplete }: { onComplete: () => void }) =>
    React.createElement(
      "PaywallScreen",
      { onComplete },
      "Mock Pepta Plus Paywall",
    ),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: mocks.user,
    updateCachedUser: mocks.updateCachedUser,
    logout: vi.fn(),
  }),
}));

vi.mock("../../context/PeptaDataContext", () => ({
  usePeptaData: () => ({
    home: mocks.home,
    track: mocks.track,
    progress: mocks.progress,
    refreshHome: mocks.refreshHome,
    refreshTrack: vi.fn(() => Promise.resolve()),
    refreshProgress: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock("../../services/api", () => ({
  api: {
    getHome: mocks.getHome,
    getTrack: mocks.getTrack,
    getProgress: mocks.getProgress,
    updateAccount: mocks.updateAccount,
    updateProfileSettings: mocks.updateProfileSettings,
  },
}));

vi.mock("../../config", () => ({
  PRIVACY_URL: "https://pepta.test/privacy",
  TERMS_URL: "https://pepta.test/terms",
}));

function home(partial: Partial<HomeResponse["profile"]> = {}): HomeResponse {
  return {
    activeCompounds: [],
    medicationLevels: [],
    profile: {
      weightUnit: "lb",
      heightUnit: "in",
      goalWeightUnit: "lb",
      doseUnitPreference: "mg",
      journeyStartDate: "2026-06-01",
      ...partial,
    },
  } as unknown as HomeResponse;
}

function track(): TrackResponse {
  return {
    doseLogs: [],
    mealLogs: [
      {
        id: "meal_1",
        userId: "u1",
        foodName: "Eggs",
        protein: 18,
        calories: 220,
        source: "manual",
        datetime: "2026-06-24T12:00:00.000Z",
        deletedAt: null,
        createdAt: "2026-06-24T12:00:00.000Z",
        updatedAt: "2026-06-24T12:00:00.000Z",
      },
    ],
    waterLogs: [],
    proteinLogs: [],
    activityLogs: [],
    sideEffectLogs: [],
    measurements: [],
    sectionErrors: {},
  } as unknown as TrackResponse;
}

function progress(): ProgressResponse {
  return {
    weights: [],
    measurements: [],
    progressPhotos: [],
    weeklyRetention: [],
    sectionErrors: {},
  } as unknown as ProgressResponse;
}

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

describe("AccountScreen settings", () => {
  beforeEach(() => {
    mocks.alert.mockClear();
    mocks.share.mockClear();
    mocks.navigate.mockClear();
    mocks.openSettings.mockClear();
    mocks.openURL.mockClear();
    mocks.getHome.mockClear();
    mocks.getTrack.mockClear();
    mocks.getProgress.mockClear();
    mocks.refreshHome.mockClear();
    mocks.updateAccount.mockClear();
    mocks.updateCachedUser.mockClear();
    mocks.updateProfileSettings.mockClear();
    mocks.updateAccount.mockImplementation((patch: { displayName?: string }) =>
      Promise.resolve({
        ...mocks.user!,
        displayName: patch.displayName,
      }),
    );
    mocks.updateProfileSettings.mockResolvedValue({});
    mocks.home = home();
    mocks.track = track();
    mocks.progress = progress();
    mocks.getHome.mockResolvedValue(mocks.home);
    mocks.getTrack.mockResolvedValue(mocks.track);
    mocks.getProgress.mockResolvedValue(mocks.progress);
    mocks.user = {
      id: "u1",
      email: "nick@pepta.app",
      emailVerified: true,
      authProviders: [
        {
          provider: "google",
          providerUserId: "google-user-1",
          linkedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      onboardingComplete: true,
      entitlement: { status: "free", expiresAt: null, willRenew: false },
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    } as User;
  });

  it("uses an in-app units selector and reflects the selected value immediately", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<AccountScreen />);
    });

    await act(async () => {
      pressableContaining(tree!.root, "UnitsImperial").props.onPress();
    });

    expect(mocks.alert).not.toHaveBeenCalled();
    expect(nodeText(tree!.root)).toContain("Metric (kg · cm)");

    await act(async () => {
      pressableContaining(tree!.root, "Metric (kg · cm)").props.onPress();
    });

    expect(mocks.updateProfileSettings).toHaveBeenCalledWith({
      weightUnit: "kg",
      heightUnit: "cm",
      goalWeightUnit: "kg",
    });
    expect(nodeText(tree!.root)).toContain("UnitsMetric");
  });

  it("opens account details from the profile header", async () => {
    mocks.user = {
      ...mocks.user!,
      displayName: "Nick",
    } as User;
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<AccountScreen />);
    });

    await act(async () => {
      pressableContaining(tree!.root, "Nick").props.onPress();
    });

    expect(mocks.alert).not.toHaveBeenCalledWith("Profile", expect.any(String));
    expect(mocks.navigate).toHaveBeenCalledWith("AccountDetails");
  });

  it("uses an in-app dose unit selector and reflects the selected value immediately", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<AccountScreen />);
    });

    await act(async () => {
      pressableContaining(tree!.root, "Dose unitsmg").props.onPress();
    });

    expect(mocks.alert).not.toHaveBeenCalled();
    expect(nodeText(tree!.root)).toContain("ml");

    await act(async () => {
      pressableContaining(tree!.root, "ml").props.onPress();
    });

    expect(mocks.updateProfileSettings).toHaveBeenCalledWith({
      doseUnitPreference: "ml",
    });
    expect(nodeText(tree!.root)).toContain("Dose unitsml");
  });

  it("opens account setting selectors with enough vertical room", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<AccountScreen />);
    });

    await act(async () => {
      pressableContaining(tree!.root, "UnitsImperial").props.onPress();
    });

    expect(
      tree!.root.findByProps({ testID: "settings-bottom-sheet" }).props.height,
    ).toBe("48%");
  });

  it("opens the dose unit selector taller than the units selector", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<AccountScreen />);
    });

    await act(async () => {
      pressableContaining(tree!.root, "Dose unitsmg").props.onPress();
    });

    expect(
      tree!.root.findByProps({ testID: "settings-bottom-sheet" }).props.height,
    ).toBe("56%");
  });

  it("shares a fresh Pepta report export from the Account row", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<AccountScreen />);
    });

    await act(async () => {
      await pressableContaining(tree!.root, "Export report").props.onPress();
    });

    expect(mocks.getHome).toHaveBeenCalledTimes(1);
    expect(mocks.getTrack).toHaveBeenCalledTimes(1);
    expect(mocks.getProgress).toHaveBeenCalledTimes(1);
    expect(mocks.alert).not.toHaveBeenCalled();
    expect(mocks.share).toHaveBeenCalledTimes(1);

    const content = mocks.share.mock.calls[0]?.[0];
    expect(content).toBeDefined();
    expect(content!.title).toBe("Pepta report export");
    expect(JSON.parse(content!.message).logs.mealLogs[0].foodName).toBe("Eggs");
  });

  it("opens the widget setup screen from Add widgets", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<AccountScreen />);
    });

    await act(async () => {
      pressableContaining(tree!.root, "Add widgets").props.onPress();
    });

    expect(mocks.alert).not.toHaveBeenCalledWith(
      "Add widgets",
      expect.any(String),
    );
    expect(mocks.navigate).toHaveBeenCalledWith("WidgetSetup");
  });

  it("opens the in-app paywall from the free Upgrade subscription card", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<AccountScreen />);
    });

    expect(nodeText(tree!.root)).not.toContain("Mock Pepta Plus Paywall");

    await act(async () => {
      pressableContaining(
        tree!.root,
        "Pepta PlusUnlock your full planUpgrade",
      ).props.onPress();
    });

    expect(nodeText(tree!.root)).toContain("Mock Pepta Plus Paywall");
  });

  it("opens Apple subscription management for active subscriptions", async () => {
    mocks.user = {
      ...mocks.user!,
      entitlement: {
        status: "active",
        expiresAt: "2026-07-31T00:00:00.000Z",
        willRenew: true,
      },
    } as User;
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<AccountScreen />);
    });

    await act(async () => {
      pressableContaining(tree!.root, "Pepta PlusActive").props.onPress();
    });

    expect(mocks.openURL).toHaveBeenCalledWith(
      "https://apps.apple.com/account/subscriptions",
    );
  });

  it("opens the FAQ screen from support", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<AccountScreen />);
    });

    await act(async () => {
      pressableContaining(tree!.root, "FAQ").props.onPress();
    });

    expect(mocks.navigate).toHaveBeenCalledWith("AccountFAQ");
  });

  it("opens Pepta legal pages from account settings", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<AccountScreen />);
    });

    await act(async () => {
      pressableContaining(tree!.root, "Terms").props.onPress();
    });

    await act(async () => {
      pressableContaining(tree!.root, "Privacy").props.onPress();
    });

    expect(mocks.openURL).toHaveBeenNthCalledWith(
      1,
      "https://pepta.test/terms",
    );
    expect(mocks.openURL).toHaveBeenNthCalledWith(
      2,
      "https://pepta.test/privacy",
    );
  });

  it("opens report emails to the Boltzman dev inbox", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<AccountScreen />);
    });

    await act(async () => {
      pressableContaining(tree!.root, "Report a problem").props.onPress();
    });

    expect(mocks.openURL).toHaveBeenCalledWith(
      "mailto:dev@boltzman.ai?subject=Pepta%20bug%20report",
    );
  });
});
