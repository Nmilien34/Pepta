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

say "1/7 JS ↔ native module parity (autolinking vs Podfile.lock)"
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

say "2/7 Pods in sync with lockfile"
if [ -f ios/Pods/Manifest.lock ] && diff -q ios/Podfile.lock ios/Pods/Manifest.lock >/dev/null 2>&1; then
  ok "ios/Pods matches Podfile.lock"
else
  bad "ios/Pods out of sync with Podfile.lock (run: cd ios && pod install)"
fi

say "3/7 Production env baked into the bundle"
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

say "4/7 Typecheck"
if npx tsc --noEmit >/dev/null 2>&1; then ok "tsc clean"; else bad "tsc failed (run: npm run typecheck)"; fi

say "5/7 Lint (rules-of-hooks is the load-bearing part)"
# A conditional hook is a guaranteed runtime crash, not a style problem —
# builds 20-22 shipped one in HomeScreen that blanked the app on entry the
# moment /home data arrived. eslint-plugin-react-hooks now guards the whole
# tree, but a rule that never runs before an archive protects nobody.
if npx eslint src >/dev/null 2>&1; then ok "eslint clean"; else bad "eslint failed (run: npx eslint src)"; fi

say "6/7 Tests"
if npm run -s test >/dev/null 2>&1; then ok "tests pass"; else bad "tests failed (run: npm test)"; fi

say "7/7 OTA runtime version parity (Expo.plist vs Info.plist vs app.config)"
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
if [ "$fail" -ne 0 ]; then
  say "PREFLIGHT FAILED — do not archive."
  exit 1
fi
say "Preflight passed. Safe to archive."
