import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MealLogSheet } from "./MealLogSheet";
import { api } from "../services/api";

const audioMocks = vi.hoisted(() => ({
  fileBase64: vi.fn(),
  recorder: {
    prepareToRecordAsync: vi.fn(),
    record: vi.fn(),
    stop: vi.fn(),
    uri: null as string | null,
  },
  recorderState: {
    isRecording: false,
  },
  requestRecordingPermissionsAsync: vi.fn(),
  setAudioModeAsync: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Animated: {
    Value: vi.fn(() => ({
      interpolate: vi.fn(() => 1),
      setValue: vi.fn(),
    })),
    View: "Animated.View",
    loop: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    parallel: vi.fn(() => ({ start: (done?: () => void) => done?.() })),
    spring: vi.fn(() => ({})),
    timing: vi.fn(() => ({})),
  },
  Easing: {
    in: vi.fn((value) => value),
    out: vi.fn((value) => value),
    quad: "quad",
  },
  Image: "Image",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Modal: "Modal",
  Platform: { OS: "ios" },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  TextInput: "TextInput",
  View: "View",
  useWindowDimensions: () => ({ height: 844, width: 390 }),
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
  useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
}));

vi.mock("expo-haptics", () => ({
  default: {},
  selectionAsync: vi.fn(() => Promise.resolve()),
  notificationAsync: vi.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

vi.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
}));

vi.mock("expo-audio", () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: audioMocks.requestRecordingPermissionsAsync,
  setAudioModeAsync: audioMocks.setAudioModeAsync,
  useAudioRecorder: () => audioMocks.recorder,
  useAudioRecorderState: () => audioMocks.recorderState,
}));

vi.mock("expo-file-system", () => ({
  File: vi.fn(() => ({
    base64: audioMocks.fileBase64,
  })),
}));

vi.mock("expo-linear-gradient", () => ({
  LinearGradient: "LinearGradient",
}));

vi.mock("../theme", () => ({
  useTheme: () => ({
    colors: {
      border: "#eee",
      fiber: "#22c55e",
      primary: "#8B5CF6",
      protein: "#f97316",
      surface: "#fff",
      surfaceAlt: "#f4f4f5",
      success: "#22c55e",
      textPrimary: "#111",
      textSecondary: "#666",
      textTertiary: "#999",
      warning: "#f59e0b",
      water: "#38bdf8",
      weight: "#a78bfa",
      primaryGradientStart: "#8B5CF6",
      primaryGradientEnd: "#A855F7",
    },
    radii: { card: 20, pill: 999 },
    shadows: { card: {} },
    spacing: { md: 16 },
  }),
}));

vi.mock("../context/PeptaDataContext", () => ({
  usePeptaData: () => ({
    addMeal: vi.fn(),
    refreshHome: vi.fn(),
  }),
}));

vi.mock("../services/api", () => ({
  api: {
    analyzeMealPhoto: vi.fn(),
    analyzeMealVoice: vi.fn(),
    createMealLog: vi.fn(),
    searchFoods: vi.fn(),
    transcribeMealAudio: vi.fn(),
  },
}));

vi.mock("./AppText", () => ({
  AppText: ({ children }: { children?: React.ReactNode }) => children,
}));

vi.mock("./Button", () => ({
  Button: ({
    disabled,
    label,
    onPress,
  }: {
    disabled?: boolean;
    label: string;
    onPress?: () => void;
  }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
}));

vi.mock("./Icon", () => ({
  Icon: "Icon",
}));

vi.mock("./MealCamera", () => ({
  MealCamera: () => null,
}));

describe("MealLogSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    audioMocks.fileBase64.mockResolvedValue("base64-meal-audio");
    audioMocks.recorder.prepareToRecordAsync.mockResolvedValue(undefined);
    audioMocks.recorder.record.mockImplementation(() => {
      audioMocks.recorderState.isRecording = true;
    });
    audioMocks.recorder.stop.mockImplementation(async () => {
      audioMocks.recorderState.isRecording = false;
      audioMocks.recorder.uri = "file://meal.m4a";
    });
    audioMocks.recorder.uri = null;
    audioMocks.recorderState.isRecording = false;
    audioMocks.requestRecordingPermissionsAsync.mockResolvedValue({
      granted: true,
    });
    audioMocks.setAudioModeAsync.mockResolvedValue(undefined);
    vi.mocked(api.transcribeMealAudio).mockResolvedValue({
      transcript: "two eggs and avocado toast",
    });
  });

  it("lets users close the meal chooser if they change their mind", async () => {
    const onClose = vi.fn();
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <MealLogSheet visible={true} onClose={onClose} />,
      );
    });

    const closeButton = tree!.root.findByProps({
      accessibilityLabel: "Close meal log",
    });

    expect(closeButton).toBeDefined();

    await act(async () => {
      closeButton.props.onPress();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns to the previous sheet from the meal chooser when a back handler is provided", async () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <MealLogSheet visible={true} onClose={onClose} onBack={onBack} />,
      );
    });

    const closeButton = tree!.root.findByProps({
      accessibilityLabel: "Close meal log",
    });

    await act(async () => {
      closeButton.props.onPress();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("records voice meal audio, transcribes it, and shows the transcript in the box", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <MealLogSheet visible={true} onClose={vi.fn()} />,
      );
    });

    await act(async () => {
      tree!.root
        .findByProps({ accessibilityLabel: "Voice meal log" })
        .props.onPress();
    });

    await act(async () => {
      tree!.root
        .findByProps({ accessibilityLabel: "Start voice meal recording" })
        .props.onPress();
    });

    await act(async () => {
      tree!.update(<MealLogSheet visible={true} onClose={vi.fn()} />);
    });

    await act(async () => {
      await tree!.root
        .findByProps({ accessibilityLabel: "Stop voice meal recording" })
        .props.onPress();
    });

    expect(api.transcribeMealAudio).toHaveBeenCalledWith({
      audioData: "base64-meal-audio",
      audioMimeType: "audio/m4a",
    });
    expect(
      tree!.root.findByProps({ accessibilityLabel: "Meal voice transcript" })
        .props.value,
    ).toBe("two eggs and avocado toast");
  });
});
