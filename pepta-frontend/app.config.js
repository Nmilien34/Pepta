// Single source for marketing + OTA runtime version WITHIN this file (the
// bare workflow forbids runtime-version policies, so it must be a literal).
// Info.plist and pbxproj still hardcode their own copies — bump ALL of them
// together; preflight-release.sh step 7 fails the archive on drift.
const marketingVersion = "1.0.9";

const appsFlyerDevKey = process.env.EXPO_PUBLIC_APPSFLYER_DEV_KEY ?? "";
const appsFlyerAppId = process.env.EXPO_PUBLIC_APPSFLYER_APP_ID ?? "";
const appsFlyerDiagnosticEventEnabled =
  process.env.EXPO_PUBLIC_APPSFLYER_DIAGNOSTIC_EVENT_ENABLED === "true";

const posthogApiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? "";
const posthogHost =
  process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

module.exports = {
  expo: {
    name: "Pepta",
    slug: "pepta",
    owner: "boltzman",
    version: marketingVersion,
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    icon: "./assets/icon.png",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "ai.boltzman.peptaapp",
      buildNumber: "45",
      usesAppleSignIn: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription:
          "Pepta uses your camera to scan meals and capture progress photos.",
        NSPhotoLibraryUsageDescription:
          "Pepta uses your photo library so you can upload progress photos and meal images.",
        NSMicrophoneUsageDescription:
          "Pepta uses your microphone so you can log meals by voice.",
      },
      appleTeamId: "N8J23B3BBW",
    },
    android: {
      package: "ai.boltzman.peptaapp",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#FFFFFF",
      },
      permissions: [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
      ],
    },
    web: {
      bundler: "metro",
    },
    // OTA updates (EAS Update). The runtime version IS the marketing version:
    // any native change already forces a marketing bump (closed trains), which
    // is exactly when OTA compatibility breaks. JS-only fixes ship with
    // `eas update --channel production`; the native Expo.plist must carry the
    // SAME url/runtime version — preflight-release.sh step 7 checks parity.
    runtimeVersion: marketingVersion,
    updates: {
      url: "https://u.expo.dev/4004b063-3984-463d-825d-01fb70cc4fa5",
    },
    plugins: [
      "expo-font",
      [
        "expo-camera",
        {
          cameraPermission:
            "Pepta uses your camera to scan meals and capture progress photos.",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "Pepta uses your photos for progress and meal images.",
          cameraPermission: "Pepta uses your camera for progress and meal images.",
        },
      ],
      [
        "@react-native-google-signin/google-signin",
        {
          iosUrlScheme:
            "com.googleusercontent.apps.853468832171-j7pc8665i51q9lf9tbe0a5toji28e4dd",
        },
      ],
      [
        "expo-audio",
        {
          microphonePermission:
            "Pepta uses your microphone so you can log meals by voice.",
        },
      ],
      [
        "expo-build-properties",
        {
          ios: {
            useFrameworks: "static",
          },
        },
      ],
      [
        "react-native-appsflyer",
        {
          shouldUseStrictMode: false,
          shouldUsePurchaseConnector: false,
          preferAppsFlyerBackupRules: false,
        },
      ],
      [
        "expo-tracking-transparency",
        {
          userTrackingPermission:
            "Pepta uses attribution data to understand which campaigns help people discover the app.",
        },
      ],
    ],
    extra: {
      appsFlyerDevKey,
      appsFlyerAppId,
      appsFlyerDiagnosticEventEnabled,
      posthogApiKey,
      posthogHost,
      eas: {
        projectId: "4004b063-3984-463d-825d-01fb70cc4fa5",
      },
    },
  },
};
