import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MealLogSheet } from "./MealLogSheet";
import { api } from "../services/api";
import { AI_CONSENT_STORAGE_KEY } from "../services/aiConsent";
import { testStorage } from "../tests/testStorage";

const saveLogMock = vi.hoisted(() => vi.fn(async () => "saved" as const));

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
  Keyboard: { addListener: vi.fn(() => ({ remove: vi.fn() })) },
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
    saveLog: saveLogMock,
    addMeal: vi.fn(),
    refreshHome: vi.fn(),
    refreshTrack: vi.fn(),
  }),
}));

vi.mock("../services/api", () => ({
  api: {
    analyzeMealPhoto: vi.fn(),
    analyzeProductPhoto: vi.fn(),
    analyzeMealBarcode: vi.fn(),
    analyzeMealVoice: vi.fn(),
    createMealLog: vi.fn(),
    searchFoods: vi.fn(),
    transcribeMealAudio: vi.fn(),
    composeRecipe: vi.fn(),
    createRecipe: vi.fn(),
  },
}));

vi.mock("./AppText", () => ({
  AppText: ({ children }: { children?: React.ReactNode }) => children,
}));

vi.mock("./Button", () => ({
  Button: ({
    accessibilityLabel,
    disabled,
    label,
    onPress,
  }: {
    accessibilityLabel?: string;
    disabled?: boolean;
    label: string;
    onPress?: () => void;
  }) =>
    React.createElement(
      "Button",
      { accessibilityLabel, disabled, onPress },
      label,
    ),
}));

vi.mock("./Icon", () => ({
  Icon: "Icon",
}));

vi.mock("./MealCamera", () => ({
  MealCamera: ({ onCapture }: { onCapture?: (uri: string) => void }) =>
    React.createElement("MealCamera", { onCapture }),
}));

vi.mock("./BarcodeScanner", () => ({
  BarcodeScanner: ({
    onScanned,
    visible,
  }: {
    onScanned?: (code: string) => void;
    visible?: boolean;
  }) => React.createElement("BarcodeScanner", { onScanned, visible }),
}));

function nodeText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string" ? child : nodeText(child as TestRenderer.ReactTestInstance),
    )
    .join("");
}

describe("MealLogSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testStorage.clear();
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
    vi.mocked(api.createMealLog).mockResolvedValue({
      id: "meal-1",
      userId: "user-1",
      foodName: "Chobani Zero Sugar Greek Yogurt",
      servingSize: "1 container",
      protein: 11,
      calories: 60,
      carbs: 5,
      fat: 0,
      fiber: 0,
      source: "barcode",
      datetime: "2026-07-14T12:00:00.000Z",
      deletedAt: null,
      createdAt: "2026-07-14T12:00:00.000Z",
      updatedAt: "2026-07-14T12:00:00.000Z",
    });
    vi.mocked(api.analyzeProductPhoto).mockResolvedValue({
      scanId: "product-scan-1",
      analysis: {
        foodName: "Chobani Zero Sugar Greek Yogurt",
        servingSize: "1 container",
        protein: 11,
        calories: 60,
        carbs: 5,
        fat: 0,
        fiber: 0,
        confidence: 0.88,
      },
      coachContent: null,
      note: "Review this packaged product before logging.",
      visionEngineVersion: "product-scan-v1",
      product: {
        mode: "product_scan",
        barcode: "081212903020",
        brand: "Chobani",
        productName: "Zero Sugar Greek Yogurt",
        source: "open_food_facts",
        citations: [],
      },
    });
    vi.mocked(api.analyzeMealBarcode).mockResolvedValue({
      scanId: "barcode-1",
      analysis: {
        foodName: "Chobani Zero Sugar Greek Yogurt",
        servingSize: "1 container",
        protein: 11,
        calories: 60,
        carbs: 5,
        fat: 0,
        fiber: 0,
        confidence: 0.88,
      },
      coachContent: null,
      note: "Review this packaged product before logging.",
      visionEngineVersion: "barcode-lookup-v1",
      product: {
        mode: "barcode",
        barcode: "081212903020",
        brand: "Chobani",
        productName: "Zero Sugar Greek Yogurt",
        source: "open_food_facts",
        citations: [],
      },
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

  it("keeps the search sheet anchored instead of lifting the back button under the status area", async () => {
    await testStorage.setItem(AI_CONSENT_STORAGE_KEY, "accepted");
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <MealLogSheet visible={true} onClose={vi.fn()} />,
      );
    });

    await act(async () => {
      tree!.root
        .findByProps({ accessibilityLabel: "Search meal log" })
        .props.onPress();
    });

    const keyboardAvoidingView = tree!.root.find(
      (node) => String(node.type) === "KeyboardAvoidingView",
    );
    const backButton = tree!.root.findByProps({
      accessibilityLabel: "Back to meal log options",
    });

    expect(keyboardAvoidingView.props.behavior).toBeUndefined();
    expect(backButton.props.hitSlop).toEqual({
      bottom: 14,
      left: 14,
      right: 14,
      top: 14,
    });
  });

  it("opens straight into voice when the New-recipe route asks for it", async () => {
    // Skipping the chooser is the whole point: the user already chose on the
    // New recipe screen, and asking again would be asking twice.
    await testStorage.setItem(AI_CONSENT_STORAGE_KEY, "accepted");
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <MealLogSheet visible={true} onClose={vi.fn()} start="voice" />,
      );
    });

    // The voice view's own control is present without anyone tapping through.
    expect(
      tree!.root.findAllByProps({
        accessibilityLabel: "Start voice meal recording",
      }).length,
    ).toBeGreaterThan(0);
  });

  it("opens straight into food search when asked", async () => {
    await testStorage.setItem(AI_CONSENT_STORAGE_KEY, "accepted");
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <MealLogSheet visible={true} onClose={vi.fn()} start="search" />,
      );
    });

    // Positively on the search view — its field — and not on the chooser.
    expect(
      tree!.root.findAllByProps({ placeholder: "Search foods — e.g. chicken" }).length,
    ).toBeGreaterThan(0);
    expect(
      tree!.root.findAllByProps({ accessibilityLabel: "Voice meal log" }).length,
    ).toBe(0);
  });

  it("still asks for AI consent on a recipe route — a recipe is no reason to skip it", async () => {
    await testStorage.removeItem(AI_CONSENT_STORAGE_KEY);
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <MealLogSheet visible={true} onClose={vi.fn()} start="scan" keepAsRecipe />,
      );
    });

    const texts: string[] = [];
    const walk = (n: TestRenderer.ReactTestInstance) => {
      for (const c of n.children) {
        if (typeof c === "string") texts.push(c);
        else walk(c);
      }
    };
    walk(tree!.root);
    expect(texts.join(" ")).toMatch(/AI|data sharing/i);
  });

  it("records voice meal audio, transcribes it, and shows the transcript in the box", async () => {
    await testStorage.setItem(AI_CONSENT_STORAGE_KEY, "accepted");
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

  it("shows AI data sharing disclosure before opening an AI meal action", async () => {
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

    expect(nodeText(tree!.root)).toContain("AI features use OpenAI");
    expect(
      tree!.root.findAllByProps({
        accessibilityLabel: "Start voice meal recording",
      }),
    ).toHaveLength(0);

    await act(async () => {
      tree!.root
        .findByProps({ accessibilityLabel: "Continue with AI features" })
        .props.onPress();
    });

    expect(await testStorage.getItem(AI_CONSENT_STORAGE_KEY)).toBe("accepted");
    expect(
      tree!.root.findByProps({ accessibilityLabel: "Start voice meal recording" }),
    ).toBeDefined();
  });

  it("uses the product photo endpoint when the user scans packaged food", async () => {
    await testStorage.setItem(AI_CONSENT_STORAGE_KEY, "accepted");
    audioMocks.fileBase64.mockResolvedValue("base64-product-photo");
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <MealLogSheet visible={true} onClose={vi.fn()} />,
      );
    });

    await act(async () => {
      tree!.root
        .findByProps({ accessibilityLabel: "Product meal log" })
        .props.onPress();
    });

    await act(async () => {
      tree!.root
        .find((node) => String(node.type) === "MealCamera")
        .props.onCapture("file://label.png");
    });

    expect(api.analyzeProductPhoto).toHaveBeenCalledWith({
      imageData: "base64-product-photo",
      imageMimeType: "image/png",
      capturedAt: expect.any(String),
    });
    expect(nodeText(tree!.root)).toContain("Chobani Zero Sugar Greek Yogurt");
  });

  it("presents the barcode scanner only after the sheet finishes dismissing", async () => {
    // Regression: presenting the scanner Modal while the sheet Modal is still
    // up (mid hide-animation) wedges iOS's presentation queue — app freeze.
    await testStorage.setItem(AI_CONSENT_STORAGE_KEY, "accepted");
    const RN = await import("react-native");
    const parallelMock = vi.mocked(RN.Animated.parallel);
    const originalImpl = parallelMock.getMockImplementation();
    const pendingAnimations: Array<() => void> = [];
    parallelMock.mockImplementation(() => ({
      start: (done?: (result: { finished: boolean }) => void) => {
        if (done) pendingAnimations.push(() => done({ finished: true }));
      },
      stop: () => undefined,
      reset: () => undefined,
    }));

    try {
      let tree: TestRenderer.ReactTestRenderer | undefined;
      await act(async () => {
        tree = TestRenderer.create(
          <MealLogSheet visible={true} onClose={vi.fn()} />,
        );
      });
      await act(async () => {
        pendingAnimations.splice(0).forEach((finish) => finish());
      });

      await act(async () => {
        tree!.root
          .findByProps({ accessibilityLabel: "Barcode meal log" })
          .props.onPress();
      });

      const scanner = () =>
        tree!.root.find((node) => String(node.type) === "BarcodeScanner");
      const sheetModal = () =>
        tree!.root.find(
          (node) =>
            String(node.type) === "Modal" && node.props.transparent === true,
        );

      // The sheet is mid-dismissal: its Modal is still up, so the scanner
      // must not be presenting yet.
      expect(sheetModal().props.visible).toBe(true);
      expect(scanner().props.visible).toBe(false);

      // Hide animation completes → onDismissed → now the scanner presents.
      await act(async () => {
        pendingAnimations.splice(0).forEach((finish) => finish());
      });
      expect(scanner().props.visible).toBe(true);
    } finally {
      if (originalImpl) parallelMock.mockImplementation(originalImpl);
    }
  });

  it("uses the barcode endpoint and logs barcode meals with barcode source", async () => {
    await testStorage.setItem(AI_CONSENT_STORAGE_KEY, "accepted");
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <MealLogSheet visible={true} onClose={vi.fn()} />,
      );
    });

    await act(async () => {
      tree!.root
        .findByProps({ accessibilityLabel: "Barcode meal log" })
        .props.onPress();
    });

    await act(async () => {
      await tree!.root
        .find((node) => String(node.type) === "BarcodeScanner")
        .props.onScanned("081212903020");
    });

    expect(api.analyzeMealBarcode).toHaveBeenCalledWith({
      barcode: "081212903020",
      scannedAt: expect.any(String),
    });

    await act(async () => {
      tree!.root.findByProps({ label: "Confirm & log" }).props.onPress();
    });

    // Meals now go through the durable outbox path, not a bare POST.
    expect(saveLogMock).toHaveBeenCalledWith(
      "meal",
      expect.objectContaining({
        foodName: "Chobani Zero Sugar Greek Yogurt",
        source: "barcode",
      }),
    );
  });
});

describe("MealLogSheet · keeping the result as a recipe", () => {
  const apiMock = api as unknown as Record<string, ReturnType<typeof vi.fn>> & {
    composeRecipe: ReturnType<typeof vi.fn>;
    createRecipe: ReturnType<typeof vi.fn>;
  };

  const composed = {
    name: "Overnight oats + whey",
    ingredients: [
      { name: "Rolled oats", amount: "1/2 cup dry", protein: 5, calories: 150 },
      { name: "Whey protein", amount: "1 scoop", protein: 24, calories: 120 },
    ],
    confidence: 0.85,
  };

  /** Fills manual entry and commits, which is what triggers composing. */
  const commit = async (props: Record<string, unknown>) => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <MealLogSheet
          visible={true}
          onClose={vi.fn()}
          seed={{ foodName: "Overnight oats", servingSize: "1 bowl", protein: 40, calories: 440 }}
          {...props}
        />,
      );
    });
    await act(async () => {
      const label = (props as { keepAsRecipe?: boolean }).keepAsRecipe
        ? "Save recipe"
        : "Add to today";
      tree!.root.findByProps({ label }).props.onPress();
    });
    return tree!;
  };

  const texts = (tree: TestRenderer.ReactTestRenderer) => {
    const out: string[] = [];
    const walk = (n: TestRenderer.ReactTestInstance) => {
      for (const c of n.children) {
        if (typeof c === "string") out.push(c);
        else walk(c);
      }
    };
    walk(tree.root);
    // Joined with nothing: React splits "{n} g protein" into two children, and
    // a space here would render it as "29  g protein".
    return out.join("");
  };

  beforeEach(() => {
    apiMock.composeRecipe.mockReset().mockResolvedValue(composed);
    apiMock.createRecipe.mockReset().mockResolvedValue({});
  });

  it("composes the parts and shows them for review — nothing is saved yet", async () => {
    const tree = await commit({ keepAsRecipe: true });

    expect(apiMock.composeRecipe).toHaveBeenCalled();
    // The user has not agreed to anything at this point.
    expect(apiMock.createRecipe).not.toHaveBeenCalled();
    const shown = texts(tree);
    expect(shown).toContain("Rolled oats");
    expect(shown).toContain("Whey protein");
  });

  it("states its confidence rather than showing bare estimates", async () => {
    const tree = await commit({ keepAsRecipe: true });
    expect(texts(tree)).toMatch(/Adjust anything that looks off/);
  });

  it("says so more firmly when the model was unsure", async () => {
    apiMock.composeRecipe.mockResolvedValue({ ...composed, confidence: 0.2 });
    const tree = await commit({ keepAsRecipe: true });
    expect(texts(tree)).toMatch(/Low confidence/);
  });

  it("saves what the user confirmed, once they confirm it", async () => {
    const tree = await commit({ keepAsRecipe: true });
    await act(async () => {
      tree.root.findByProps({ label: "Save recipe" }).props.onPress();
    });
    expect(apiMock.createRecipe).toHaveBeenCalledWith({
      name: composed.name,
      ingredients: composed.ingredients,
    });
  });

  it("drops a row the model invented, and the total follows", async () => {
    const tree = await commit({ keepAsRecipe: true });
    expect(texts(tree)).toContain("29 g protein"); // 5 + 24

    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: "Remove Whey protein" }).props.onPress();
    });

    expect(texts(tree)).toContain("5 g protein");
    await act(async () => {
      tree.root.findByProps({ label: "Save recipe" }).props.onPress();
    });
    expect(apiMock.createRecipe.mock.calls[0]![0].ingredients).toHaveLength(1);
  });

  it("still offers the one line it has when composing fails", async () => {
    apiMock.composeRecipe.mockRejectedValue(new Error("timeout"));
    const tree = await commit({ keepAsRecipe: true });

    // Losing what the user just described because a second model call timed
    // out would be the worse failure — they review it and can still save.
    expect(texts(tree)).toContain("Overnight oats");
    await act(async () => {
      tree.root.findByProps({ label: "Save recipe" }).props.onPress();
    });
    expect(apiMock.createRecipe.mock.calls[0]![0].ingredients).toHaveLength(1);
  });

  it("does not compose or save a recipe on a normal meal log", async () => {
    await commit({});
    expect(apiMock.composeRecipe).not.toHaveBeenCalled();
    expect(apiMock.createRecipe).not.toHaveBeenCalled();
  });
});
