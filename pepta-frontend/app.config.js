const appsFlyerDevKey = process.env.EXPO_PUBLIC_APPSFLYER_DEV_KEY ?? "";
const appsFlyerAppId = process.env.EXPO_PUBLIC_APPSFLYER_APP_ID ?? "";
const appsFlyerDiagnosticEventEnabled =
  process.env.EXPO_PUBLIC_APPSFLYER_DIAGNOSTIC_EVENT_ENABLED === "true";

module.exports = {
  expo: {
    name: "Pepta",
    slug: "pepta",
    version: "1.0.1",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    icon: "./assets/icon.png",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "ai.boltzman.peptaapp",
      buildNumber: "13",
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
    },
  },
};
