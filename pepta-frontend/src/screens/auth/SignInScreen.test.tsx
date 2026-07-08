import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInScreen } from "./SignInScreen";

const mocks = vi.hoisted(() => ({
  configureGoogle: vi.fn(),
  openURL: vi.fn(() => Promise.resolve()),
  signInWithApple: vi.fn(),
  signInWithDemo: vi.fn(),
  signInWithGoogle: vi.fn(),
  devSignIn: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Animated: {
    Value: vi.fn(function Value(this: { value: number }, value: number) {
      this.value = value;
    }),
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("Animated.View", props, children),
    spring: vi.fn(() => ({ start: vi.fn() })),
  },
  Linking: {
    openURL: mocks.openURL,
  },
  KeyboardAvoidingView: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
  }) => React.createElement("KeyboardAvoidingView", props, children),
  Modal: ({
    children,
    visible,
    ...props
  }: {
    children?: React.ReactNode;
    visible?: boolean;
  }) => (visible ? React.createElement("Modal", props, children) : null),
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
  StatusBar: "StatusBar",
  StyleSheet: { absoluteFill: {}, create: (styles: unknown) => styles },
  Text: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
  TextInput: (props: Record<string, unknown>) =>
    React.createElement("TextInput", props),
  View: "View",
}));

vi.mock("expo-apple-authentication", () => ({
  AppleAuthenticationScope: {
    EMAIL: "EMAIL",
    FULL_NAME: "FULL_NAME",
  },
  AppleAuthenticationButtonType: {
    SIGN_IN: 0,
    CONTINUE: 1,
    SIGN_UP: 2,
  },
  AppleAuthenticationButtonStyle: {
    WHITE: 0,
    WHITE_OUTLINE: 1,
    BLACK: 2,
  },
  // Renders nothing in tests; the native button only exists on device.
  AppleAuthenticationButton: () => null,
  signInAsync: vi.fn(),
}));

vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: mocks.configureGoogle,
    hasPlayServices: vi.fn(),
    signIn: vi.fn(),
  },
}));

vi.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("LinearGradient", props, children),
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("SafeAreaView", props, children),
}));

vi.mock("../../config", () => ({
  GOOGLE_IOS_CLIENT_ID: "ios-client",
  GOOGLE_WEB_CLIENT_ID: "web-client",
  PRIVACY_URL: "https://pepta.test/privacy",
  TERMS_URL: "https://pepta.test/terms",
}));

vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fff",
      border: "#eee",
      primary: "#8B5CF6",
      surface: "#fff",
      textPrimary: "#111",
      textSecondary: "#666",
      textTertiary: "#999",
    },
    motion: {
      scale: { pressIn: 0.98, pressOut: 1 },
      springs: { press: {} },
    },
    radii: { pill: 999 },
    sizes: {
      button: { height: 56 },
      hitSlop: 10,
    },
    spacing: {
      sm: 8,
      md: 12,
      lg: 16,
      xl: 24,
      "2xl": 32,
    },
  }),
}));

vi.mock("../../components", () => ({
  AppText: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
  Float: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("View", null, children),
  Mascot: "Mascot",
  Reveal: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("View", null, children),
}));

vi.mock("../../components/Icon", () => ({
  Icon: "Icon",
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    devSignIn: mocks.devSignIn,
    signInWithApple: mocks.signInWithApple,
    signInWithDemo: mocks.signInWithDemo,
    signInWithGoogle: mocks.signInWithGoogle,
  }),
}));

function nodeText(node: ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string" ? child : nodeText(child as ReactTestInstance),
    )
    .join("");
}

function textLink(
  root: TestRenderer.ReactTestRenderer["root"],
  label: string,
): ReactTestInstance {
  const match = root
    .findAll(
      (node) =>
        (node.type as unknown) === "Text" &&
        nodeText(node) === label &&
        typeof node.props.onPress === "function",
    )
    .at(0);
  if (!match) throw new Error(`No tappable text link named "${label}"`);
  return match;
}

function button(
  root: TestRenderer.ReactTestRenderer["root"],
  label: string,
): ReactTestInstance {
  const match = root
    .findAll(
      (node) =>
        (node.type as unknown) === "Pressable" &&
        node.props.accessibilityRole === "button" &&
        node.props.accessibilityLabel === label &&
        typeof node.props.onPress === "function",
    )
    .at(0);
  if (!match) throw new Error(`No button named "${label}"`);
  return match;
}

describe("SignInScreen legal links", () => {
  beforeEach(() => {
    mocks.configureGoogle.mockClear();
    mocks.openURL.mockClear();
    mocks.signInWithDemo.mockReset();
  });

  it("opens terms and privacy from the sign-in footer", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<SignInScreen onBack={vi.fn()} />);
    });

    await act(async () => {
      await textLink(tree!.root, "Terms").props.onPress();
    });

    await act(async () => {
      await textLink(tree!.root, "Privacy Policy").props.onPress();
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

  it("opens the reviewer sign-in modal and submits demo credentials", async () => {
    mocks.signInWithDemo.mockResolvedValue(undefined);
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<SignInScreen onBack={vi.fn()} />);
    });

    await act(async () => {
      button(tree!.root, "Reviewer sign-in").props.onPress();
    });

    const inputs = tree!.root.findAllByType(
      "TextInput" as unknown as React.ElementType,
    );
    expect(inputs).toHaveLength(2);
    const passwordInput = inputs.at(1);
    if (!passwordInput) throw new Error("Missing password input");

    await act(async () => {
      passwordInput.props.onChangeText("PeptaReview2026!");
    });

    await act(async () => {
      await button(tree!.root, "Sign in").props.onPress();
    });

    expect(mocks.signInWithDemo).toHaveBeenCalledWith(
      "review@pepta.app",
      "PeptaReview2026!",
    );
  });
});
