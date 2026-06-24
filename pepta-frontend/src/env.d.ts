declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_BASE_URL?: string;
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?: string;
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?: string;
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?: string;
  }
}

// Static audio assets are bundled by Metro and imported as an asset module id.
declare module '*.wav' {
  const asset: number;
  export default asset;
}

// Injected by the React Native bundler (true in development).
declare const __DEV__: boolean;

// Tabler icons (matching the design lab) are deep-imported per icon to avoid
// bundling all 5,800: `import IconHome2 from '@tabler/icons-react-native/IconHome2'`.
declare module '@tabler/icons-react-native/*' {
  import type { ComponentType } from 'react';
  import type { SvgProps } from 'react-native-svg';
  export interface TablerIconProps extends SvgProps {
    size?: number | string;
    color?: string;
    stroke?: number | string;
  }
  const Icon: ComponentType<TablerIconProps>;
  export default Icon;
}
