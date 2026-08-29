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
      buildNumber: "47",
      usesAppleSignIn: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription:
          "Pepta uses your camera to scan meals and capture progress photos.",
        NSPhotoLibraryUsageDescription:
          "Pepta uses your photo library so you can upload progress photos and meal images.",
        NSMicrophoneUsageDescription:
          "Pepta uses your microphone so you can log meals by voice.",
        // SKADNETWORK — ADDED 2026-08-28, AND ITS ABSENCE WAS THE BUG.
        //
        // There was no SKAdNetworkItems array at all, so Apple sent a postback
        // to NOBODY. For every ATT-denied user — the overwhelming majority —
        // SKAN is the only attribution channel iOS has, so Facebook installs
        // arrived with no signal and defaulted to organic: 745 clicks across
        // Aug 26-28 while "organic" jumped from ~2.4/day to ~28/day.
        //
        // Declared HERE rather than in ios/Pepta/Info.plist because prebuild
        // regenerates that file. Config that does not reach the built plist is
        // worth nothing, which is the same class of mistake as the missing
        // array itself — see the prebuild verification in the report.
        //
        // IDs are transcribed from each network's own published list, never
        // from memory: a wrong identifier fails SILENTLY, which is exactly the
        // failure mode being fixed. Sources and dates:
        //   Meta      v9wttpbfk9 / n38lu8286q
        //             developers.facebook.com/docs/setting-up/platform-setup/
        //             ios/SKAdNetwork/ — and independently confirmed against
        //             Google's third-party list below, which carries both.
        //   Google    cstr6suwn9
        //             developers.google.com/admob/ios/quick-start
        //             (3p list last updated 2026-01-30)
        //   TikTok    mj797d8u6f
        //             TikTok's own SKAN page does not publish the identifier;
        //             taken from Adjust's TikTok For Business integration doc,
        //             where it appears as the ad-network-id in a live postback.
        //
        // NO APPLE ENTRY EXISTS TO ADD. Apple Search Ads attributes through
        // the AdServices framework, not SKAdNetwork, so there is no Apple
        // SKAdNetworkIdentifier — adding a guessed one would be worse than
        // leaving it out. AppsFlyer is an MMP rather than an ad network and
        // likewise has none.
        SKAdNetworkItems: [
          { SKAdNetworkIdentifier: "v9wttpbfk9.skadnetwork" },
          { SKAdNetworkIdentifier: "n38lu8286q.skadnetwork" },
          { SKAdNetworkIdentifier: "cstr6suwn9.skadnetwork" },
          { SKAdNetworkIdentifier: "mj797d8u6f.skadnetwork" },
        ],
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
          // DELIBERATELY FALSE — REVENUECAT OWNS PURCHASE REPORTING.
          //
          // Reviewed 2026-08-28 while fixing attribution. Turning this on
          // would DOUBLE COUNT: revenueCat.ts already calls setAppsflyerID()
          // when the AppsFlyer ID becomes available (revenueCat.ts:245-247),
          // which switches on RevenueCat's server-to-server integration. That
          // pipe demonstrably works — the single af_start_trial in the Aug
          // 21-28 AppsFlyer report came from it, not from this app, which
          // sends no af_purchase anywhere outside a test file.
          //
          // RevenueCat wins on merit, not just on being first. The Purchase
          // Connector only sees a StoreKit transaction at the moment of
          // purchase. RevenueCat is already this app's source of truth for
          // subscription STATE and reports renewals, refunds, grace periods,
          // cancellations and trial conversions — the events that matter for
          // ROAS. Running both would report each purchase twice and corrupt
          // exactly the revenue numbers the switch was meant to fix.
          //
          // The reason Meta receives no Purchase or StartTrial is NOT this
          // flag: those events already reach AppsFlyer. They stop at the
          // AppsFlyer -> Meta postback mapping, which is dashboard config.
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
