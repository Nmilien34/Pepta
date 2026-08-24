#!/usr/bin/env bash
# Release preflight for Pepta. Run before every archive:
#   ./scripts/preflight-release.sh
#
# Exists because build 3 shipped with expo-notifications in the JS bundle but
# no EXNotifications pod in the binary (CocoaPods had been failing silently in
# non-UTF-8 shells) — the app white-screened at launch and App Review rejected
# it under 2.1(a). Every check here is a class of that failure.
set -uo pipefail
cd "$(dirname "$0")/.."

# CocoaPods crashes with Encoding::CompatibilityError in non-UTF-8 shells.
export LANG="${LANG:-en_US.UTF-8}" LC_ALL="${LC_ALL:-en_US.UTF-8}"

fail=0
say()  { printf '%s\n' "$*"; }
ok()   { say "  ✓ $*"; }
bad()  { say "  ✗ $*"; fail=1; }

say "1/9 JS ↔ native module parity (autolinking vs Podfile.lock)"
missing=$(npx expo-modules-autolinking resolve -p apple --json 2>/dev/null | python3 -c '
import json, re, sys
resolved = json.load(sys.stdin)
lock = open("ios/Podfile.lock").read()
locked = set(re.findall(r"^  - ([A-Za-z0-9_+-]+)", lock, re.M))
missing = []
for m in resolved.get("modules", []):
    for pod in m.get("pods", []):
        name = pod.get("podName")
        if name and name not in locked:
            missing.append(f"{m.get('packageName')} -> {name}")
print("\n".join(missing))
')
if [ -n "$missing" ]; then
  bad "native pods missing from Podfile.lock (run: cd ios && pod install):"
  say "$missing"
else
  ok "every autolinked Expo module has its pod in Podfile.lock"
fi

# THE GAP THAT SHIPPED BUILD 35 BROKEN (2026-08-21).
#
# A pod being PRESENT is not the same as it being the SAME VERSION as the JS
# Metro bundles. Build 35 carried react-native-worklets 0.8.3 in the bundle —
# reanimated resolves it from the repo root — while RNWorklets compiled from a
# nested 0.5.1. Mismatched TurboModule ABI: NativeWorklets threw "Exception in
# HostFunction" the instant it initialised, expo-updates' ErrorRecovery had no
# cached update to fall back to, and the app aborted 0.7s into launch. Every
# other gate passed: the pod existed, Pods matched Podfile.lock, tsc and lint
# were clean, and 1689 tests passed because tests mock native modules.
#
# Resolution is done FROM THE PACKAGE THAT IMPORTS IT, not from the app — that
# distinction is the whole bug, and checking it the easy way reproduces it.
say "1b/9 native pod versions == resolved JS versions"
drift=$(python3 - <<'PY'
import json, os, re, subprocess, sys

lock = open("ios/Podfile.lock").read()
# "  - RNWorklets (0.5.1):"  → {pod: version}
locked = dict(re.findall(r"^  - ([A-Za-z0-9_+-]+) \(([0-9][^)]*)\):", lock, re.M))
# "  - RNWorklets (from <backtick>../../node_modules/react-native-worklets<backtick>)"
# The backticks are written as \x60: this python lives inside a $( ) command
# substitution, and a literal backtick there is a nested substitution to bash.
sources = dict(re.findall(r"^  - ([A-Za-z0-9_+-]+) \(from \x60([^\x60]+)\x60\)", lock, re.M))

drift = []
for pod, path in sources.items():
    if "node_modules/" not in path:
        continue
    pkg_dir = os.path.normpath(os.path.join("ios", path))
    pkg_json = os.path.join(pkg_dir, "package.json")
    if not os.path.exists(pkg_json):
        continue
    try:
        pkg = json.load(open(pkg_json))
    except Exception:
        continue
    name, native = pkg.get("name"), locked.get(pod)
    if not name or not native:
        continue
    # What Node/Metro ACTUALLY resolves for this package name, from the app.
    try:
        resolved_path = subprocess.check_output(
            ["node", "-e",
             "process.stdout.write(require.resolve(process.argv[1]+'/package.json',"
             "{paths:[process.cwd()]}))", name],
            stderr=subprocess.DEVNULL, text=True,
        ).strip()
        js = json.load(open(resolved_path)).get("version")
    except Exception:
        continue
    if js and js != native:
        # SAME DIRECTORY = SAME PACKAGE = CANNOT DRIFT. The check exists for
        # the worklets crash, where the pod was built from one directory and
        # Metro bundled another. When both point at the SAME package dir, a
        # version mismatch is the library's own podspec lying about itself
        # (react-native-health 1.19.0 hardcodes s.version = '1.7.0') — noisy,
        # but the binary and bundle are one codebase. Compare dirs, not names,
        # so this never becomes a per-package allowlist.
        if os.path.realpath(pkg_dir) == os.path.realpath(os.path.dirname(resolved_path)):
            continue
        drift.append(f"{name}: pod {native} (from {path}) != bundled JS {js} (at {resolved_path})")
print("\n".join(drift))
PY
)
if [ -n "$drift" ]; then
  bad "native/JS version drift — the binary and the bundle disagree (run: npm dedupe && cd ios && pod install):"
  say "$drift"
else
  ok "every locally-sourced pod matches the JS version Metro will bundle"
fi

say "2/9 Pods in sync with lockfile"
if [ -f ios/Pods/Manifest.lock ] && diff -q ios/Podfile.lock ios/Pods/Manifest.lock >/dev/null 2>&1; then
  ok "ios/Pods matches Podfile.lock"
else
  bad "ios/Pods out of sync with Podfile.lock (run: cd ios && pod install)"
fi

say "3/9 Production env baked into the bundle"
if [ ! -f .env ]; then
  bad ".env missing — EXPO_PUBLIC_* vars won't be inlined"
else
  api=$(grep -E '^EXPO_PUBLIC_API_BASE_URL=' .env | cut -d= -f2-)
  case "$api" in
    *localhost*|*127.0.0.1*|"") bad "EXPO_PUBLIC_API_BASE_URL is '$api' — not a production URL" ;;
    https://*) ok "API base URL: $api" ;;
    *) bad "EXPO_PUBLIC_API_BASE_URL is '$api' — expected https://" ;;
  esac
  grep -qE '^EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_' .env \
    && ok "RevenueCat iOS key present" \
    || bad "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY missing or malformed"
fi

say "4/9 Typecheck"
if npx tsc --noEmit >/dev/null 2>&1; then ok "tsc clean"; else bad "tsc failed (run: npm run typecheck)"; fi

say "5/9 Lint (rules-of-hooks is the load-bearing part)"
# A conditional hook is a guaranteed runtime crash, not a style problem —
# builds 20-22 shipped one in HomeScreen that blanked the app on entry the
# moment /home data arrived. eslint-plugin-react-hooks now guards the whole
# tree, but a rule that never runs before an archive protects nobody.
if npx eslint src >/dev/null 2>&1; then ok "eslint clean"; else bad "eslint failed (run: npx eslint src)"; fi

say "6/9 Tests"
if npm run -s test >/dev/null 2>&1; then ok "tests pass"; else bad "tests failed (run: npm test)"; fi

say "7/9 OTA runtime version parity (Expo.plist vs Info.plist vs app.config)"
# An OTA update only reaches binaries whose EXUpdatesRuntimeVersion equals the
# published runtime (policy: the marketing version). If the plist lags a
# version bump, every user on that build is stranded off the update channel —
# silently. Same class of drift as the three version sources, so same gate.
ota=$(/usr/libexec/PlistBuddy -c 'Print :EXUpdatesRuntimeVersion' ios/Pepta/Supporting/Expo.plist 2>/dev/null)
mkt=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' ios/Pepta/Info.plist 2>/dev/null)
cfg=$(node -e 'process.stdout.write(require("./app.config.js").expo.version)' 2>/dev/null)
if [ -n "$ota" ] && [ "$ota" = "$mkt" ] && [ "$ota" = "$cfg" ]; then
  ok "runtime version $ota matches Info.plist and app.config"
else
  bad "runtime version drift — Expo.plist '$ota' vs Info.plist '$mkt' vs app.config '$cfg'"
fi
if /usr/libexec/PlistBuddy -c 'Print :EXUpdatesEnabled' ios/Pepta/Supporting/Expo.plist 2>/dev/null | grep -q true; then
  ok "EXUpdatesEnabled true"
else
  bad "EXUpdatesEnabled is not true in Expo.plist — OTA client would ship dead"
fi

echo
say "8/9 build number parity (Info.plist vs pbxproj vs app.config)"
# THE ONE THAT ACTUALLY SHIPS IS Info.plist. CFBundleVersion there is a
# LITERAL — it does not read $(CURRENT_PROJECT_VERSION) — so bumping the
# pbxproj and app.config.js looks like a version bump, passes every other
# check, and archives with the OLD number. Build 37 was archived as 36 exactly
# this way; App Store Connect rejects the duplicate, but only after the upload.
b_plist=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' ios/Pepta/Info.plist 2>/dev/null)
b_proj=$(grep -o 'CURRENT_PROJECT_VERSION = [0-9]*;' ios/Pepta.xcodeproj/project.pbxproj | grep -o '[0-9]*' | sort -u)
b_cfg=$(node -e 'process.stdout.write(require("./app.config.js").expo.ios.buildNumber)' 2>/dev/null)
if [ "$(printf '%s' "$b_proj" | wc -l)" -gt 0 ]; then
  bad "pbxproj has more than one CURRENT_PROJECT_VERSION value: $(echo $b_proj)"
elif [ -n "$b_plist" ] && [ "$b_plist" = "$b_proj" ] && [ "$b_plist" = "$b_cfg" ]; then
  ok "build number $b_plist agrees across all three"
else
  bad "build number drift — Info.plist '$b_plist' vs pbxproj '$b_proj' vs app.config '$b_cfg'"
fi

echo
say "9/9 entitlement purpose strings (Apple rejects at upload, not at build)"
# THE CHECK THIS EXISTS FOR: 1.0.9 build 40 archived cleanly, passed all
# eight checks, and was REJECTED BY THE UPLOAD — HealthKit was entitled with
# only NSHealthShareUsageDescription. We request read-only (write: []), so
# the update string looked unnecessary; Apple's scanner does not care what we
# CALL, only what the linked library REFERENCES, and react-native-health
# includes HealthKit write APIs. Their error says it outright: "While your
# app might not use these APIs, a purpose string is still required."
#
# Table-driven so the next entitlement adds a row, not a lesson.
missing=$(python3 - <<'PYEOF'
import plistlib, re

ent = plistlib.load(open("ios/Pepta/Pepta.entitlements", "rb"))
info = open("ios/Pepta/Info.plist").read()

# entitlement key -> purpose strings Apple demands when it is present
REQUIRED = {
    "com.apple.developer.healthkit": [
        "NSHealthShareUsageDescription",
        "NSHealthUpdateUsageDescription",
    ],
}

missing = []
for key, strings in REQUIRED.items():
    if not ent.get(key):
        continue
    for name in strings:
        if f"<key>{name}</key>" not in info:
            missing.append(f"{key} is entitled but {name} is absent from Info.plist")
        else:
            body = re.search(rf"<key>{name}</key>\s*<string>([^<]*)</string>", info)
            if not body or len(body.group(1).strip()) < 20:
                missing.append(f"{name} is present but too short to satisfy review")
print("\n".join(missing))
PYEOF
)
if [ -n "$missing" ]; then
  bad "an entitlement is missing its purpose string — the upload WILL be rejected:"
  say "$missing"
else
  ok "every entitlement carries the purpose strings Apple requires"
fi

echo
if [ "$fail" -ne 0 ]; then
  say "PREFLIGHT FAILED — do not archive."
  exit 1
fi
say "Preflight passed. Safe to archive."
