// Personal Apple Developer teams can't use the "Sign in with Apple" capability,
// so an on-device dev build fails to sign. `expo-apple-authentication` auto-adds
// the `com.apple.developer.applesignin` entitlement on every prebuild; this plugin
// strips it back out (it runs last, after that plugin) so personal-team dev builds
// sign cleanly. Remove this plugin once you have a paid Apple Developer account.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo config plugins are loaded as CommonJS.
const { withEntitlementsPlist } = require("@expo/config-plugins");

module.exports = function withoutAppleSignIn(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults["com.apple.developer.applesignin"];
    return cfg;
  });
};
