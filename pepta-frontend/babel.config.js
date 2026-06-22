// Expo Babel config. The reanimated plugin must be listed LAST. Env vars come
// from EXPO_PUBLIC_* (inlined by Expo), so no dotenv plugin is needed.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
