import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReferralCodeScreen } from "./ReferralCodeScreen";
import { api } from "../../services/api";
import { ApiError } from "../../services/apiError";
import { appsFlyer } from "../../services/appsflyer";

const mocks = vi.hoisted(() => ({
  onDone: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
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
  Text: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
  TextInput: "TextInput",
  View: "View",
}));

vi.mock("expo-haptics", () => ({
  notificationAsync: vi.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

vi.mock("../../theme/typography", () => ({
  typography: { fonts: { medium: "m", semiBold: "sb", bold: "b", heavy: "h" } },
}));

vi.mock("../../components", () => ({
  ConvoScreen: ({
    children,
    footer,
  }: {
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }) => React.createElement("View", null, children, footer),
  ConvoButton: ({
    label,
    disabled,
    onPress,
  }: {
    label: string;
    disabled?: boolean;
    onPress?: () => void;
  }) =>
    React.createElement("ConvoButton", { disabled, onPress }, label),
  Mascot: ({ pose }: { pose: string }) => React.createElement("Mascot", { pose }),
  convo: {
    ink: "#111",
    soft: "#555",
    faint: "#999",
    hairline: "#eee",
    surface: "#fff",
  },
}));

vi.mock("../../services/api", () => ({
  api: { claimReferralCode: vi.fn() },
}));

vi.mock("../../services/appsflyer", () => ({
  appsFlyer: { logAnalyticsEvent: vi.fn(() => Promise.resolve()) },
}));

function input(tree: TestRenderer.ReactTestRenderer) {
  return tree.root.findByProps({ accessibilityLabel: "Referral code" });
}

function applyButton(tree: TestRenderer.ReactTestRenderer) {
  return tree.root.find((node) => String(node.type) === "ConvoButton");
}

function skipButton(tree: TestRenderer.ReactTestRenderer) {
  return tree.root.findByProps({ accessibilityLabel: "Skip referral code" });
}

async function renderScreen() {
  let tree: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    tree = TestRenderer.create(
      <ReferralCodeScreen progress={0.9} onDone={mocks.onDone} />,
    );
  });
  return tree!;
}

describe("ReferralCodeScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.onDone.mockClear();
    vi.mocked(api.claimReferralCode).mockReset();
    vi.mocked(appsFlyer.logAnalyticsEvent).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("logs a view event on mount without any code payload", async () => {
    await renderScreen();
    expect(appsFlyer.logAnalyticsEvent).toHaveBeenCalledWith(
      "referral_screen_viewed",
    );
  });

  it("applies a trimmed code, celebrates, then continues one beat later", async () => {
    vi.mocked(api.claimReferralCode).mockResolvedValue({
      code: "PEP20",
      alreadyClaimed: false,
    });
    const tree = await renderScreen();

    await act(async () => {
      input(tree).props.onChangeText("  pep20  ");
    });
    await act(async () => {
      applyButton(tree).props.onPress();
    });

    expect(api.claimReferralCode).toHaveBeenCalledWith({ code: "pep20" });
    expect(appsFlyer.logAnalyticsEvent).toHaveBeenCalledWith(
      "referral_code_applied",
    );
    // The raw entered code must never reach analytics.
    for (const call of vi.mocked(appsFlyer.logAnalyticsEvent).mock.calls) {
      expect(JSON.stringify(call)).not.toContain("pep20");
      expect(JSON.stringify(call)).not.toContain("PEP20");
    }
    // Pep celebrates with the wave; success line shows the normalized code.
    expect(
      tree.root.find((n) => String(n.type) === "Mascot").props.pose,
    ).toBe("wave");
    expect(mocks.onDone).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    expect(mocks.onDone).toHaveBeenCalledTimes(1);
  });

  it("cancels delayed navigation when the screen unmounts", async () => {
    vi.mocked(api.claimReferralCode).mockResolvedValue({
      code: "PEP20",
      alreadyClaimed: false,
    });
    const tree = await renderScreen();

    await act(async () => {
      input(tree).props.onChangeText("PEP20");
    });
    await act(async () => {
      applyButton(tree).props.onPress();
    });
    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    expect(mocks.onDone).not.toHaveBeenCalled();
  });

  it("keeps the user on-screen with a friendly message for an invalid code", async () => {
    vi.mocked(api.claimReferralCode).mockRejectedValue(
      new ApiError(404, "We couldn’t find that code. Check the spelling — or skip for now."),
    );
    const tree = await renderScreen();

    await act(async () => {
      input(tree).props.onChangeText("NOPE123");
    });
    await act(async () => {
      applyButton(tree).props.onPress();
    });

    expect(appsFlyer.logAnalyticsEvent).toHaveBeenCalledWith(
      "referral_code_invalid",
    );
    const alert = tree.root.findByProps({ accessibilityRole: "alert" });
    expect(alert.props.children).toContain("We couldn’t find that code");
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(mocks.onDone).not.toHaveBeenCalled();
  });

  it("submits via the keyboard go action", async () => {
    vi.mocked(api.claimReferralCode).mockResolvedValue({
      code: "PEP20",
      alreadyClaimed: false,
    });
    const tree = await renderScreen();

    await act(async () => {
      input(tree).props.onChangeText("PEP20");
    });
    await act(async () => {
      input(tree).props.onSubmitEditing();
    });

    expect(api.claimReferralCode).toHaveBeenCalledTimes(1);
  });

  it("prevents duplicate submissions while a claim is in flight", async () => {
    let resolveClaim: (v: { code: string; alreadyClaimed: boolean }) => void;
    vi.mocked(api.claimReferralCode).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveClaim = resolve;
        }),
    );
    const tree = await renderScreen();

    await act(async () => {
      input(tree).props.onChangeText("PEP20");
    });
    await act(async () => {
      applyButton(tree).props.onPress();
      applyButton(tree).props.onPress();
    });
    await act(async () => {
      resolveClaim!({ code: "PEP20", alreadyClaimed: false });
    });

    expect(api.claimReferralCode).toHaveBeenCalledTimes(1);
  });

  it("does not skip in the same frame that a claim starts", async () => {
    let resolveClaim: (v: { code: string; alreadyClaimed: boolean }) => void;
    vi.mocked(api.claimReferralCode).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveClaim = resolve;
        }),
    );
    const tree = await renderScreen();

    await act(async () => {
      input(tree).props.onChangeText("PEP20");
    });
    await act(async () => {
      applyButton(tree).props.onPress();
      skipButton(tree).props.onPress();
    });

    expect(mocks.onDone).not.toHaveBeenCalled();
    expect(appsFlyer.logAnalyticsEvent).not.toHaveBeenCalledWith(
      "referral_code_skipped",
    );

    await act(async () => {
      resolveClaim!({ code: "PEP20", alreadyClaimed: false });
    });
    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    expect(mocks.onDone).toHaveBeenCalledTimes(1);
    expect(appsFlyer.logAnalyticsEvent).toHaveBeenCalledWith(
      "referral_code_applied",
    );
  });

  it("skip continues immediately and logs the skip event", async () => {
    const tree = await renderScreen();

    await act(async () => {
      skipButton(tree).props.onPress();
    });

    expect(mocks.onDone).toHaveBeenCalledTimes(1);
    expect(api.claimReferralCode).not.toHaveBeenCalled();
    expect(appsFlyer.logAnalyticsEvent).toHaveBeenCalledWith(
      "referral_code_skipped",
    );
  });
});
