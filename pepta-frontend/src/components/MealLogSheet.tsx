// MealLogSheet — the "Log meal" flow opened from the QuickLog chooser. Three
// ways in: Scan (camera/library photo → AI vision), Describe (typed/spoken text
// → AI), or Manual entry. Scan/voice land on a result card (macros + neutral
// tracker note + optional structured swap) before logging. Every save
// optimistically folds macros into today's Home totals, then POSTs /meal-logs
// and reconciles.

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { Icon } from "./Icon";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File } from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../theme";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { BottomSheet } from "./BottomSheet";
import { MealCamera } from "./MealCamera";
import { usePeptaData } from "../context/PeptaDataContext";
import { api } from "../services/api";
import {
  analysisToMealLog,
  foodResultToMealLog,
  isManualMealValid,
  pickImageMime,
  toManualMealLog,
  type FoodSearchResult,
  type MealSource,
} from "../screens/app/mealLog";
import type { MealLogInput, MealScanResponse } from "@pepta/shared";

type View_ =
  | "chooser"
  | "voice"
  | "manual"
  | "search"
  | "analyzing"
  | "result"
  | "error";

export interface MealLogSheetProps {
  visible: boolean;
  onClose(): void;
}

export function MealLogSheet({ visible, onClose }: MealLogSheetProps) {
  const theme = useTheme();
  const { addMeal, refreshHome } = usePeptaData();
  const [view, setView] = useState<View_>("chooser");
  const [result, setResult] = useState<MealScanResponse | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [portion, setPortion] = useState(1);
  const [source, setSource] = useState<MealSource>("scan");
  const [errorMsg, setErrorMsg] = useState("");
  const [manual, setManual] = useState({
    foodName: "",
    protein: "",
    calories: "",
    carbs: "",
    fat: "",
    fiber: "",
  });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  // Debounced food search (only while the search view is open).
  useEffect(() => {
    if (view !== "search") return undefined;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchFailed(false);
      return undefined;
    }
    setSearching(true);
    setSearchFailed(false);
    const id = setTimeout(() => {
      api
        .searchFoods(q)
        .then((r) => setResults(r))
        .catch(() => {
          setResults([]);
          setSearchFailed(true);
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(id);
  }, [view, query]);

  useEffect(() => {
    if (visible) {
      setView("chooser");
      setResult(null);
      setPreview(null);
      setPortion(1);
      setManual({
        foodName: "",
        protein: "",
        calories: "",
        carbs: "",
        fat: "",
        fiber: "",
      });
      setQuery("");
      setResults([]);
      setSearchFailed(false);
      setCameraOpen(false);
    }
  }, [visible]);

  const now = () => new Date().toISOString();

  // Optimistic: fold macros into Home now, close, POST in background, reconcile.
  const commit = (input: MealLogInput) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined,
    );
    addMeal(input);
    onClose();
    api
      .createMealLog(input)
      .then(() => refreshHome())
      .catch(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
          () => undefined,
        );
        return refreshHome();
      })
      .catch(() => undefined);
  };

  // Analyze a photo from a file URI (in-app camera capture or library pick). We
  // read base64 here, AFTER the picker/camera dismisses — passing `base64: true`
  // to the picker does a massive synchronous bridge transfer on a full-res photo
  // and freezes iOS; reading via expo-file-system here is off the hot path.
  const analyzeUri = async (uri: string, mimeType?: string) => {
    setPreview(uri);
    setSource("scan");
    setView("analyzing");
    try {
      const imageData = await new File(uri).base64();
      const scan = await api.analyzeMealPhoto({
        imageData,
        imageMimeType: pickImageMime(mimeType, uri),
        capturedAt: now(),
      });
      setResult(scan);
      setPortion(1);
      setView("result");
    } catch {
      setErrorMsg(
        "Couldn’t analyze that photo. Try again, or log it manually.",
      );
      setView("error");
    }
  };

  const pickFromLibrary = async () => {
    Haptics.selectionAsync().catch(() => undefined);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setErrorMsg(
          "Pepta needs photos access to scan meals. You can still log manually.",
        );
        setView("error");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        quality: 0.5,
        mediaTypes: ["images"],
      });
      const asset = res.canceled ? null : res.assets[0];
      if (!asset?.uri) return; // user cancelled
      void analyzeUri(asset.uri, asset.mimeType);
    } catch {
      setErrorMsg("Couldn’t open your library. Try again, or log it manually.");
      setView("error");
    }
  };

  const analyzeVoice = async (text: string) => {
    const transcript = text.trim();
    if (!transcript) return;
    Haptics.selectionAsync().catch(() => undefined);
    setSource("voice");
    setView("analyzing");
    try {
      const scan = await api.analyzeMealVoice({
        transcript,
        recordedAt: now(),
      });
      setResult(scan);
      setPreview(null);
      setPortion(1);
      setView("result");
    } catch {
      setErrorMsg(
        "Couldn’t read that description. Try again, or log it manually.",
      );
      setView("error");
    }
  };

  // Scale the AI estimate by the chosen portion count before logging.
  const scaledAnalysis = () => {
    if (!result) return null;
    const a = result.analysis;
    return {
      ...a,
      protein: a.protein * portion,
      calories: a.calories * portion,
      carbs: a.carbs * portion,
      fat: a.fat * portion,
      fiber: a.fiber * portion,
    };
  };

  const logResult = () => {
    const a = scaledAnalysis();
    if (!a || !result) return;
    commit(analysisToMealLog(a, source, now(), result.photoS3Key));
  };

  // "Edit details" — drop the (portion-scaled) estimate into the manual form.
  const editResult = () => {
    const a = scaledAnalysis();
    if (!a) return;
    Haptics.selectionAsync().catch(() => undefined);
    setManual({
      foodName: a.foodName,
      protein: String(Math.round(a.protein)),
      calories: String(Math.round(a.calories)),
      carbs: String(Math.round(a.carbs)),
      fat: String(Math.round(a.fat)),
      fiber: String(Math.round(a.fiber)),
    });
    setView("manual");
  };

  const logSearchResult = (r: FoodSearchResult) => {
    commit(foodResultToMealLog(r, now()));
  };

  const logManual = () => {
    const meal = {
      foodName: manual.foodName,
      protein: Number(manual.protein) || 0,
      calories: Number(manual.calories) || 0,
      ...(manual.carbs ? { carbs: Number(manual.carbs) } : {}),
      ...(manual.fat ? { fat: Number(manual.fat) } : {}),
      ...(manual.fiber ? { fiber: Number(manual.fiber) } : {}),
    };
    if (!isManualMealValid(meal)) return;
    commit(toManualMealLog(meal, now()));
  };

  const back = () => {
    Haptics.selectionAsync().catch(() => undefined);
    setView("chooser");
  };

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose}>
        {/* header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 4,
          }}
        >
          {view !== "chooser" && view !== "analyzing" ? (
            <Pressable
              onPress={back}
              hitSlop={8}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: theme.colors.surfaceAlt,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon
                name="chevron-back"
                size={18}
                color={theme.colors.textPrimary}
              />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <AppText variant="cardTitle" style={{ fontSize: 17 }}>
              {HEADINGS[view].title}
            </AppText>
            <AppText variant="caption" color="textSecondary">
              {HEADINGS[view].sub}
            </AppText>
          </View>
        </View>

        {view === "chooser" ? (
          <View style={{ marginTop: 12, gap: 11 }}>
            <Tile
              theme={theme}
              icon={
                <Icon name="camera" size={22} color={theme.colors.protein} />
              }
              title="Scan a photo"
              hint="Snap your plate — Pepta reads the macros"
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setCameraOpen(true);
              }}
            />
            <Tile
              theme={theme}
              icon={<Icon name="images" size={22} color={theme.colors.water} />}
              title="Upload from library"
              hint="Pick an existing photo"
              onPress={() => void pickFromLibrary()}
            />
            <Tile
              theme={theme}
              icon={<Icon name="mic" size={22} color={theme.colors.primary} />}
              title="Say what you ate"
              hint="Speak it or type — “chicken & rice”"
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setView("voice");
              }}
            />
            <Tile
              theme={theme}
              icon={<Icon name="search" size={22} color={theme.colors.fiber} />}
              title="Search foods"
              hint="Find a food and its macros"
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setView("search");
              }}
            />
            <Tile
              theme={theme}
              icon={
                <Icon
                  name="pencil-outline"
                  size={22}
                  color={theme.colors.textSecondary}
                />
              }
              title="Enter manually"
              hint="Type the food + macros"
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setView("manual");
              }}
            />
          </View>
        ) : null}

        {view === "analyzing" ? (
          <View style={{ paddingVertical: 40, alignItems: "center", gap: 14 }}>
            {preview ? (
              <Image
                source={{ uri: preview }}
                style={{ width: 120, height: 120, borderRadius: 16 }}
              />
            ) : null}
            <ActivityIndicator color={theme.colors.primary} />
            <AppText variant="body" color="textSecondary">
              Reading your meal…
            </AppText>
          </View>
        ) : null}

        {view === "voice" ? (
          <VoiceCapture theme={theme} onAnalyze={analyzeVoice} />
        ) : null}

        {view === "result" && result ? (
          <ResultView
            theme={theme}
            result={result}
            preview={preview}
            source={source}
            portion={portion}
            onPortion={setPortion}
            onLog={logResult}
            onEdit={editResult}
          />
        ) : null}

        {view === "manual" ? (
          <ManualView
            theme={theme}
            manual={manual}
            setManual={setManual}
            onSave={logManual}
          />
        ) : null}

        {view === "search" ? (
          <SearchView
            theme={theme}
            query={query}
            onQuery={setQuery}
            results={results}
            searching={searching}
            failed={searchFailed}
            onPick={logSearchResult}
            onManual={() => setView("manual")}
          />
        ) : null}

        {view === "error" ? (
          <View style={{ paddingVertical: 28, alignItems: "center", gap: 12 }}>
            <Icon
              name="alert-circle-outline"
              size={30}
              color={theme.colors.warning}
            />
            <AppText
              variant="body"
              color="textSecondary"
              align="center"
              style={{ maxWidth: 280 }}
            >
              {errorMsg}
            </AppText>
            <View style={{ width: 200 }}>
              <Button
                label="Enter manually"
                onPress={() => setView("manual")}
              />
            </View>
          </View>
        ) : null}
      </BottomSheet>
      <MealCamera
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(uri) => {
          setCameraOpen(false);
          void analyzeUri(uri);
        }}
        onSearch={() => {
          setCameraOpen(false);
          setView("search");
        }}
        onVoice={() => {
          setCameraOpen(false);
          setView("voice");
        }}
      />
    </>
  );
}

type Theme = ReturnType<typeof useTheme>;

const HEADINGS: Record<View_, { title: string; sub: string }> = {
  chooser: {
    title: "Log a meal",
    sub: "Scan, describe, or enter it — macros land on Home.",
  },
  voice: { title: "Say what you ate", sub: "Tap the mic, or type a sentence." },
  manual: { title: "Enter a meal", sub: "Food name + macros." },
  search: { title: "Search foods", sub: "Find a food and add it." },
  analyzing: {
    title: "Analyzing…",
    sub: "Estimating protein, calories & fiber.",
  },
  result: {
    title: "Here’s the estimate",
    sub: "Review, then add it to today.",
  },
  error: { title: "Hmm", sub: "That didn’t work." },
};

function Tile({
  theme,
  icon,
  title,
  hint,
  onPress,
}: {
  theme: Theme;
  icon: React.ReactNode;
  title: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        padding: 14,
        borderRadius: theme.radii.card,
        backgroundColor: theme.colors.surface,
        borderWidth: 0.5,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.7 : 1,
        ...theme.shadows.card,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: theme.colors.surfaceAlt,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" style={{ fontWeight: "700" }}>
          {title}
        </AppText>
        <AppText
          variant="caption"
          color="textSecondary"
          style={{ marginTop: 2 }}
        >
          {hint}
        </AppText>
      </View>
      <Icon
        name="chevron-forward"
        size={18}
        color={theme.colors.textTertiary}
      />
    </Pressable>
  );
}

function ResultView({
  theme,
  result,
  preview,
  source,
  portion,
  onPortion,
  onLog,
  onEdit,
}: {
  theme: Theme;
  result: MealScanResponse;
  preview: string | null;
  source: MealSource;
  portion: number;
  onPortion: (n: number) => void;
  onLog: () => void;
  onEdit: () => void;
}) {
  const a = result.analysis;
  const coach = result.coachContent;
  const trackerNote = result.note?.trim();
  const macros: {
    label: string;
    value: number;
    unit: string;
    color: string;
  }[] = [
    {
      label: "Protein",
      value: a.protein,
      unit: "g",
      color: theme.colors.protein,
    },
    {
      label: "Cals",
      value: a.calories,
      unit: "",
      color: theme.colors.textPrimary,
    },
    { label: "Carbs", value: a.carbs, unit: "g", color: theme.colors.water },
    { label: "Fat", value: a.fat, unit: "g", color: theme.colors.weight },
    { label: "Fiber", value: a.fiber, unit: "g", color: theme.colors.fiber },
  ];
  const step = (delta: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    onPortion(Math.max(1, portion + delta));
  };
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {preview ? (
          <Image
            source={{ uri: preview }}
            style={{ width: 56, height: 56, borderRadius: 14 }}
          />
        ) : (
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              backgroundColor: theme.colors.surfaceAlt,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon
              name="silverware-fork-knife"
              size={24}
              color={theme.colors.textTertiary}
            />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong" style={{ fontWeight: "800" }}>
            {a.foodName}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {a.servingSize} · detected
          </AppText>
        </View>
        <View
          style={{
            backgroundColor: "#E8F8EE",
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: theme.radii.pill,
          }}
        >
          <AppText
            variant="caption"
            style={{ color: "#1E8E40", fontWeight: "700" }}
          >
            {Math.round(a.confidence * 100)}% sure
          </AppText>
        </View>
      </View>

      <View style={{ flexDirection: "row", marginTop: 14 }}>
        {macros.map((m) => (
          <View
            key={m.label}
            style={{ width: "20%", alignItems: "center", paddingVertical: 4 }}
          >
            <AppText
              variant="caption"
              color="textSecondary"
              style={{ fontSize: 10 }}
            >
              {m.label}
            </AppText>
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                gap: 1,
                marginTop: 2,
              }}
            >
              <AppText
                variant="cardTitle"
                style={{ fontSize: 16, color: m.color }}
              >
                {Math.round(m.value * portion)}
              </AppText>
              <AppText
                variant="caption"
                color="textTertiary"
                style={{ fontSize: 10 }}
              >
                {m.unit}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      {/* portion stepper (scales the estimate) */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 12,
          backgroundColor: theme.colors.surfaceAlt,
          borderRadius: theme.radii.pill,
          paddingVertical: 6,
          paddingHorizontal: 6,
        }}
      >
        <AppText
          variant="caption"
          color="textSecondary"
          style={{ fontWeight: "600", paddingLeft: 8 }}
        >
          Portion
        </AppText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Pressable
            onPress={() => step(-1)}
            hitSlop={8}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: theme.colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="remove" size={16} color={theme.colors.textPrimary} />
          </Pressable>
          <AppText
            variant="bodyStrong"
            style={{ fontWeight: "700", minWidth: 64, textAlign: "center" }}
          >
            {portion} × {a.servingSize}
          </AppText>
          <Pressable
            onPress={() => step(1)}
            hitSlop={8}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: theme.colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="add" size={16} color={theme.colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {source === "voice" ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 12,
          }}
        >
          <Icon
            name="information-circle-outline"
            size={14}
            color={theme.colors.textTertiary}
          />
          <AppText variant="caption" color="textTertiary">
            Draft — confirm before saving.
          </AppText>
        </View>
      ) : null}

      {trackerNote ? (
        <View
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 14,
            backgroundColor: "#EFEBFF",
            flexDirection: "row",
            gap: 8,
          }}
        >
          <Icon
            name="information-circle-outline"
            size={18}
            color={theme.colors.primary}
            style={{ marginTop: 1 }}
          />
          <AppText
            variant="caption"
            color="textPrimary"
            style={{ flex: 1, fontWeight: "600" }}
          >
            {trackerNote}
          </AppText>
        </View>
      ) : null}

      {coach ? (
        <View
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 14,
            backgroundColor: coach.mode === "swap" ? "#FFF6E6" : "#E8F8EE",
            flexDirection: "row",
            gap: 8,
          }}
        >
          <Icon
            name={coach.mode === "swap" ? "bulb" : "checkmark-circle"}
            size={18}
            color={
              coach.mode === "swap"
                ? theme.colors.warning
                : theme.colors.success
            }
            style={{ marginTop: 1 }}
          />
          <View style={{ flex: 1 }}>
            <AppText
              variant="caption"
              color="textPrimary"
              style={{ fontWeight: "600" }}
            >
              {coach.callout}
            </AppText>
            {coach.swap ? (
              <AppText
                variant="caption"
                color="textSecondary"
                style={{ marginTop: 4 }}
              >
                {coach.swap.description} · +
                {Math.round(coach.swap.additionalProtein)}g protein
              </AppText>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: 16 }}>
        <Button label="Confirm & log" onPress={onLog} />
      </View>
      <Pressable
        onPress={onEdit}
        hitSlop={8}
        style={{ marginTop: 12, alignSelf: "center" }}
      >
        <AppText
          variant="caption"
          color="primary"
          style={{ fontWeight: "700" }}
        >
          Edit details
        </AppText>
      </Pressable>
    </View>
  );
}

function ManualView({
  theme,
  manual,
  setManual,
  onSave,
}: {
  theme: Theme;
  manual: Record<
    "foodName" | "protein" | "calories" | "carbs" | "fat" | "fiber",
    string
  >;
  setManual: (m: typeof manual) => void;
  onSave: () => void;
}) {
  const set = (key: keyof typeof manual) => (v: string) =>
    setManual({
      ...manual,
      [key]: key === "foodName" ? v : v.replace(/[^0-9.]/g, ""),
    });
  const valid =
    manual.foodName.trim().length > 0 &&
    (Number(manual.protein) > 0 || Number(manual.calories) > 0);
  const field = (
    key: keyof typeof manual,
    placeholder: string,
    keyboard: "default" | "decimal-pad",
    flex = 1,
  ) => (
    <TextInput
      key={key}
      value={manual[key]}
      onChangeText={set(key)}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.textTertiary}
      keyboardType={keyboard === "decimal-pad" ? "decimal-pad" : "default"}
      style={{
        flex,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceAlt,
        paddingVertical: 12,
        paddingHorizontal: 14,
        fontSize: 16,
        color: theme.colors.textPrimary,
      }}
    />
  );
  return (
    <View style={{ marginTop: 16, gap: 10 }}>
      {field("foodName", "Food name", "default")}
      <View style={{ flexDirection: "row", gap: 10 }}>
        {field("protein", "Protein (g)", "decimal-pad")}
        {field("calories", "Calories", "decimal-pad")}
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {field("carbs", "Carbs (g)", "decimal-pad")}
        {field("fat", "Fat (g)", "decimal-pad")}
        {field("fiber", "Fiber (g)", "decimal-pad")}
      </View>
      <View style={{ marginTop: 6 }}>
        <Button label="Add to today" disabled={!valid} onPress={onSave} />
      </View>
    </View>
  );
}

function SearchView({
  theme,
  query,
  onQuery,
  results,
  searching,
  failed,
  onPick,
  onManual,
}: {
  theme: Theme;
  query: string;
  onQuery: (v: string) => void;
  results: FoodSearchResult[];
  searching: boolean;
  failed: boolean;
  onPick: (r: FoodSearchResult) => void;
  onManual: () => void;
}) {
  const q = query.trim();
  return (
    <View style={{ marginTop: 14, gap: 12 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: theme.colors.surfaceAlt,
          borderRadius: 12,
          paddingHorizontal: 14,
          height: 48,
        }}
      >
        <Icon name="search" size={16} color={theme.colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={onQuery}
          placeholder="Search foods — e.g. chicken"
          placeholderTextColor={theme.colors.textTertiary}
          autoFocus
          autoCorrect={false}
          style={{ flex: 1, fontSize: 16, color: theme.colors.textPrimary }}
        />
        {searching ? <ActivityIndicator color={theme.colors.primary} /> : null}
      </View>

      {results.map((r, i) => (
        <Pressable
          key={`${r.foodName}-${i}`}
          onPress={() => onPick(r)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 11,
            opacity: pressed ? 0.6 : 1,
            borderBottomWidth: i < results.length - 1 ? 0.5 : 0,
            borderBottomColor: theme.colors.border,
          })}
        >
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong" style={{ fontWeight: "700" }}>
              {r.foodName}
            </AppText>
            <AppText variant="caption" color="textSecondary">
              {r.servingSize} · {Math.round(r.protein)}g P ·{" "}
              {Math.round(r.calories)} cal
            </AppText>
          </View>
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: theme.colors.surfaceAlt,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="add" size={18} color={theme.colors.primary} />
          </View>
        </Pressable>
      ))}

      {/* states */}
      {q.length < 2 ? (
        <AppText
          variant="caption"
          color="textTertiary"
          align="center"
          style={{ paddingVertical: 18 }}
        >
          Type at least 2 letters to search.
        </AppText>
      ) : !searching && results.length === 0 ? (
        <View style={{ alignItems: "center", gap: 10, paddingVertical: 16 }}>
          <AppText variant="body" color="textSecondary" align="center">
            {failed ? "Search isn’t available yet." : `No matches for “${q}”.`}
          </AppText>
          <View style={{ width: 200 }}>
            <Button
              label="Enter manually"
              variant="secondary"
              onPress={onManual}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

// Voice capture — owns the recorder + its 500ms status poll, so those only run
// while this is mounted (i.e. the voice screen), not for the whole app's lifetime.
function VoiceCapture({
  theme,
  onAnalyze,
}: {
  theme: Theme;
  onAnalyze: (text: string) => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [transcript, setTranscript] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [voiceFailed, setVoiceFailed] = useState(false);

  useEffect(
    () => () => {
      // Release the recorder if we leave the screen mid-recording.
      recorder.stop().catch(() => undefined);
    },
    [recorder],
  );

  const startRecording = async () => {
    setVoiceFailed(false);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setVoiceFailed(true);
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      Haptics.selectionAsync().catch(() => undefined);
    } catch {
      setVoiceFailed(true);
    }
  };

  const stopRecording = async () => {
    Haptics.selectionAsync().catch(() => undefined);
    setTranscribing(true);
    setVoiceFailed(false);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) return;
      const audioData = await new File(uri).base64();
      const { transcript: text } = await api.transcribeMealAudio({
        audioData,
        audioMimeType: "audio/m4a",
      });
      setTranscript(text);
    } catch {
      // Transcription endpoint not live yet (or failed) → fall back to typing.
      setVoiceFailed(true);
    } finally {
      setTranscribing(false);
    }
  };

  const toggle = () => {
    if (recorderState.isRecording) void stopRecording();
    else void startRecording();
  };

  return (
    <View style={{ marginTop: 16, gap: 14, alignItems: "center" }}>
      <Pressable onPress={toggle} disabled={transcribing} hitSlop={8}>
        <MicButton
          theme={theme}
          recording={recorderState.isRecording}
          busy={transcribing}
        />
      </Pressable>
      {transcribing ? (
        <AppText variant="caption" color="textSecondary">
          Transcribing…
        </AppText>
      ) : (
        <AppText variant="caption" color="textSecondary">
          {recorderState.isRecording
            ? "Listening… tap to stop"
            : "Tap to speak, or type below"}
        </AppText>
      )}
      {voiceFailed ? (
        <AppText
          variant="caption"
          color="textTertiary"
          align="center"
          style={{ maxWidth: 260 }}
        >
          Couldn’t transcribe — type your meal below instead.
        </AppText>
      ) : null}
      <TextInput
        value={transcript}
        onChangeText={setTranscript}
        placeholder="e.g. Two eggs, avocado toast, and a black coffee"
        placeholderTextColor={theme.colors.textTertiary}
        multiline
        style={{
          alignSelf: "stretch",
          minHeight: 80,
          borderRadius: 14,
          backgroundColor: theme.colors.surfaceAlt,
          padding: 14,
          fontSize: 16,
          color: theme.colors.textPrimary,
          textAlignVertical: "top",
        }}
      />
      <View style={{ alignSelf: "stretch" }}>
        <Button
          label="Analyze"
          disabled={!transcript.trim() || transcribing}
          onPress={() => onAnalyze(transcript)}
        />
      </View>
    </View>
  );
}

// Gradient mic with a recording pulse; swaps to a stop glyph while recording and
// a spinner while the clip is being transcribed.
function MicButton({
  theme,
  recording,
  busy,
}: {
  theme: Theme;
  recording: boolean;
  busy: boolean;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!recording) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1100,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [recording, pulse]);
  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.8],
  });
  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0],
  });
  return (
    <View
      style={{
        width: 110,
        height: 110,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {recording ? (
        <Animated.View
          style={{
            position: "absolute",
            width: 78,
            height: 78,
            borderRadius: 39,
            backgroundColor: theme.colors.primary,
            transform: [{ scale }],
            opacity,
          }}
        />
      ) : null}
      <LinearGradient
        colors={
          [
            theme.colors.primaryGradientStart,
            theme.colors.primaryGradientEnd,
          ] as const
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 78,
          height: 78,
          borderRadius: 39,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Icon name={recording ? "stop" : "mic"} size={32} color="#fff" />
        )}
      </LinearGradient>
    </View>
  );
}
