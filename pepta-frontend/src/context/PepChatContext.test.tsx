import React from "react";
import { all } from "../tests/byLabel";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PepChatProvider, usePepChat } from "./PepChatContext";

const mocks = vi.hoisted(() => ({
  coachChat: vi.fn(),
  hasAIDataSharingConsent: vi.fn(),
  saveAIDataSharingConsent: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  KeyboardAvoidingView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("KeyboardAvoidingView", props, children),
  Modal: ({
    visible,
    children,
    ...props
  }: {
    visible?: boolean;
    children?: React.ReactNode;
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
  ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("ScrollView", props, children),
  TextInput: "TextInput",
  View: "View",
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("SafeAreaView", props, children),
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

vi.mock("expo-haptics", () => ({ selectionAsync: vi.fn(() => Promise.resolve()) }));

vi.mock("../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fff",
      border: "#eee",
      danger: "#dc2626",
      onPrimary: "#fff",
      primary: "#7C5CFC",
      surface: "#fff",
      surfaceAlt: "#f4f4f5",
      textPrimary: "#111",
      textSecondary: "#666",
      textTertiary: "#999",
    },
  }),
}));

vi.mock("../components/AppText", () => ({
  AppText: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
}));
vi.mock("../components/Icon", () => ({
  Icon: (props: { name: string }) => React.createElement("Icon", props),
}));
vi.mock("../components/Mascot", () => ({ Mascot: "Mascot" }));

vi.mock("../services/api", () => ({ api: { coachChat: mocks.coachChat } }));
vi.mock("../services/aiConsent", () => ({
  hasAIDataSharingConsent: mocks.hasAIDataSharingConsent,
  saveAIDataSharingConsent: mocks.saveAIDataSharingConsent,
}));

// A screen that opens the chat both ways: seeded (how the library does it)
// and plain (how the floating Pep does it).
function Harness({ seed }: { seed?: string }) {
  const { askPep } = usePepChat();
  return (
    <>
      {React.createElement("Pressable", {
        accessibilityLabel: "open-chat",
        onPress: () => askPep(seed),
      })}
      {React.createElement("Pressable", {
        accessibilityLabel: "open-plain",
        onPress: () => askPep(),
      })}
    </>
  );
}

function render(seed?: string) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <PepChatProvider>
        <Harness seed={seed} />
      </PepChatProvider>,
    );
  });
  return renderer;
}

function byLabel(root: ReactTestInstance, label: string): ReactTestInstance {
  const hit = all({ root: root }, label, "Pressable")[0];
  if (!hit) throw new Error(`no pressable "${label}"`);
  return hit;
}

function input(root: ReactTestInstance) {
  return root.findAllByType("TextInput" as never)[0]!;
}

describe("PepChatProvider", () => {
  beforeEach(() => {
    mocks.coachChat.mockReset();
    mocks.coachChat.mockResolvedValue({ reply: "Here's what I know.", refused: false });
    mocks.hasAIDataSharingConsent.mockReset();
    mocks.hasAIDataSharingConsent.mockResolvedValue(true);
    mocks.saveAIDataSharingConsent.mockReset();
    mocks.saveAIDataSharingConsent.mockResolvedValue(undefined);
  });

  it("stays closed until a screen asks for it", () => {
    const tree = render();
    expect(tree.root.findAll((n) => String(n.type) === "Modal")).toHaveLength(0);
  });

  it("opens with an empty composer when no seed is given", () => {
    const tree = render();
    act(() => byLabel(tree.root, "open-chat").props.onPress());

    expect(tree.root.findAll((n) => String(n.type) === "Modal")).toHaveLength(1);
    expect(input(tree.root).props.value).toBe("");
  });

  it("pre-fills the composer from a seed WITHOUT sending it", async () => {
    const seed = 'I\'m reading about BPC-157 in the Pepta library. What should I know?';
    const tree = render(seed);

    await act(async () => {
      byLabel(tree.root, "open-chat").props.onPress();
    });

    // Composed and waiting — the user can edit, and nothing has left the device.
    expect(input(tree.root).props.value).toBe(seed);
    expect(mocks.coachChat).not.toHaveBeenCalled();
    expect(mocks.hasAIDataSharingConsent).not.toHaveBeenCalled();
  });

  it("sends the seeded question when the user taps send", async () => {
    const seed = "Tell me about TB-500.";
    const tree = render(seed);

    await act(async () => {
      byLabel(tree.root, "open-chat").props.onPress();
    });
    await act(async () => {
      await byLabel(tree.root, "Send Pep message").props.onPress();
    });

    expect(mocks.coachChat).toHaveBeenCalledTimes(1);
    expect(mocks.coachChat.mock.calls[0]?.[0]).toEqual([{ role: "user", text: seed }]);
  });

  it("gates a seeded send behind AI consent when not yet granted", async () => {
    mocks.hasAIDataSharingConsent.mockResolvedValue(false);
    const tree = render("Tell me about epitalon.");

    await act(async () => {
      byLabel(tree.root, "open-chat").props.onPress();
    });
    await act(async () => {
      await byLabel(tree.root, "Send Pep message").props.onPress();
    });

    // Consent card shown, nothing sent yet.
    expect(mocks.coachChat).not.toHaveBeenCalled();
    const text = tree.root
      .findAll((n) => String(n.type) === "Text")
      .map((n) => String(n.props.children ?? ""))
      .join("\n");
    expect(text).toContain("AI chat uses OpenAI");
  });

  it("does not leak a seed into the next unseeded open", async () => {
    const tree = render("Tell me about KPV.");

    await act(async () => {
      byLabel(tree.root, "open-chat").props.onPress();
    });
    expect(input(tree.root).props.value).toBe("Tell me about KPV.");

    await act(async () => {
      byLabel(tree.root, "Close Ask Pep").props.onPress();
    });
    // Floating Pep opens it plainly — the library's question must be gone.
    await act(async () => {
      byLabel(tree.root, "open-plain").props.onPress();
    });
    expect(input(tree.root).props.value).toBe("");
  });
});

// The user's question is added to the transcript BEFORE the request goes out,
// and a failure leaves it there. Retry must resend that transcript, not
// re-append the question to it.
describe("retrying a failed answer", () => {
  beforeEach(() => {
    mocks.coachChat.mockReset();
    mocks.hasAIDataSharingConsent.mockReset();
    mocks.hasAIDataSharingConsent.mockResolvedValue(true);
    mocks.saveAIDataSharingConsent.mockReset();
    mocks.saveAIDataSharingConsent.mockResolvedValue(undefined);
  });

  async function askAndFail(seed: string) {
    mocks.coachChat.mockRejectedValueOnce(new Error("429"));
    const tree = render(seed);
    await act(async () => {
      byLabel(tree.root, "open-chat").props.onPress();
    });
    await act(async () => {
      await byLabel(tree.root, "Send Pep message").props.onPress();
    });
    return tree;
  }

  it("does not send the question twice", async () => {
    const seed = "How much protein have I had today?";
    const tree = await askAndFail(seed);
    mocks.coachChat.mockResolvedValue({ reply: "About 90g.", refused: false });

    await act(async () => {
      await byLabel(tree.root, "Retry").props.onPress();
    });

    expect(mocks.coachChat).toHaveBeenCalledTimes(2);
    // The retry carries the SAME one-message transcript, not the question
    // repeated back to back.
    expect(mocks.coachChat.mock.calls[1]?.[0]).toEqual([
      { role: "user", text: seed },
    ]);
  });

  it("does not duplicate the question in the transcript", async () => {
    const seed = "How much protein have I had today?";
    const tree = await askAndFail(seed);
    mocks.coachChat.mockResolvedValue({ reply: "About 90g.", refused: false });

    await act(async () => {
      await byLabel(tree.root, "Retry").props.onPress();
    });

    // Count rendered Text nodes only — AppText maps to "Text" in this
    // harness, so a nested walk would count the same bubble twice.
    const shown = tree.root
      .findAll((node) => String(node.type) === "Text")
      .filter((node) => node.props.children === seed);
    expect(shown).toHaveLength(1);
  });
});
