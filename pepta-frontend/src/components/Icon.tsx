// Central icon component — maps the app's icon names to Tabler icons (the set the
// design lab is built on). Deep-imported per icon so we don't bundle all 5,800.
// Usage: <Icon name="needle" size={18} color={c} />. Unknown names fall back to a
// dot (and warn in dev) so a typo never crashes a screen.

import React, { type ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import IconMinus from '@tabler/icons-react-native/IconMinus';
import IconX from '@tabler/icons-react-native/IconX';
import IconCheck from '@tabler/icons-react-native/IconCheck';
import IconCircleCheck from '@tabler/icons-react-native/IconCircleCheck';
import IconCircleX from '@tabler/icons-react-native/IconCircleX';
import IconChevronLeft from '@tabler/icons-react-native/IconChevronLeft';
import IconChevronRight from '@tabler/icons-react-native/IconChevronRight';
import IconChevronDown from '@tabler/icons-react-native/IconChevronDown';
import IconArrowRight from '@tabler/icons-react-native/IconArrowRight';
import IconArrowDownRight from '@tabler/icons-react-native/IconArrowDownRight';
import IconAlertCircle from '@tabler/icons-react-native/IconAlertCircle';
import IconAlertTriangle from '@tabler/icons-react-native/IconAlertTriangle';
import IconInfoCircle from '@tabler/icons-react-native/IconInfoCircle';
import IconCalendar from '@tabler/icons-react-native/IconCalendar';
import IconCalendarPlus from '@tabler/icons-react-native/IconCalendarPlus';
import IconClock from '@tabler/icons-react-native/IconClock';
import IconCamera from '@tabler/icons-react-native/IconCamera';
import IconCameraRotate from '@tabler/icons-react-native/IconCameraRotate';
import IconPhoto from '@tabler/icons-react-native/IconPhoto';
import IconCloudOff from '@tabler/icons-react-native/IconCloudOff';
import IconCompass from '@tabler/icons-react-native/IconCompass';
import IconPencil from '@tabler/icons-react-native/IconPencil';
import IconFileText from '@tabler/icons-react-native/IconFileText';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconBell from '@tabler/icons-react-native/IconBell';
import IconSearch from '@tabler/icons-react-native/IconSearch';
import IconSparkles from '@tabler/icons-react-native/IconSparkles';
import IconFlag from '@tabler/icons-react-native/IconFlag';
import IconTarget from '@tabler/icons-react-native/IconTarget';
import IconScale from '@tabler/icons-react-native/IconScale';
import IconLeaf from '@tabler/icons-react-native/IconLeaf';
import IconDroplet from '@tabler/icons-react-native/IconDroplet';
import IconFlame from '@tabler/icons-react-native/IconFlame';
import IconMeat from '@tabler/icons-react-native/IconMeat';
import IconVaccine from '@tabler/icons-react-native/IconVaccine';
import IconToolsKitchen2 from '@tabler/icons-react-native/IconToolsKitchen2';
import IconRuler2 from '@tabler/icons-react-native/IconRuler2';
import IconBarbell from '@tabler/icons-react-native/IconBarbell';
import IconRun from '@tabler/icons-react-native/IconRun';
import IconWalk from '@tabler/icons-react-native/IconWalk';
import IconHeart from '@tabler/icons-react-native/IconHeart';
import IconHeartbeat from '@tabler/icons-react-native/IconHeartbeat';
import IconActivityHeartbeat from '@tabler/icons-react-native/IconActivityHeartbeat';
import IconShieldCheck from '@tabler/icons-react-native/IconShieldCheck';
import IconMoodSad from '@tabler/icons-react-native/IconMoodSad';
import IconListDetails from '@tabler/icons-react-native/IconListDetails';
import IconRocket from '@tabler/icons-react-native/IconRocket';
import IconMicrophone from '@tabler/icons-react-native/IconMicrophone';
import IconUserCircle from '@tabler/icons-react-native/IconUserCircle';
import IconHome2 from '@tabler/icons-react-native/IconHome2';
import IconCircle from '@tabler/icons-react-native/IconCircle';
import IconBulb from '@tabler/icons-react-native/IconBulb';
import IconBrandApple from '@tabler/icons-react-native/IconBrandApple';
import IconBrandGoogle from '@tabler/icons-react-native/IconBrandGoogle';
import IconPill from '@tabler/icons-react-native/IconPill';
import IconChevronUp from '@tabler/icons-react-native/IconChevronUp';
import IconPlayerStopFilled from '@tabler/icons-react-native/IconPlayerStopFilled';
import IconStar from '@tabler/icons-react-native/IconStar';
import IconDots from '@tabler/icons-react-native/IconDots';
import IconEqual from '@tabler/icons-react-native/IconEqual';
import IconGenderFemale from '@tabler/icons-react-native/IconGenderFemale';
import IconGenderMale from '@tabler/icons-react-native/IconGenderMale';
import IconGenderBigender from '@tabler/icons-react-native/IconGenderBigender';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import IconRestore from '@tabler/icons-react-native/IconRestore';
import IconMoon from '@tabler/icons-react-native/IconMoon';
import IconSofa from '@tabler/icons-react-native/IconSofa';
import IconPlant2 from '@tabler/icons-react-native/IconPlant2';
import IconTrendingDown from '@tabler/icons-react-native/IconTrendingDown';
import IconAdjustmentsHorizontal from '@tabler/icons-react-native/IconAdjustmentsHorizontal';
import IconSun from '@tabler/icons-react-native/IconSun';
import IconCalendarWeek from '@tabler/icons-react-native/IconCalendarWeek';
import IconStretching from '@tabler/icons-react-native/IconStretching';
import IconChartLine from '@tabler/icons-react-native/IconChartLine';
import IconCurrentLocation from '@tabler/icons-react-native/IconCurrentLocation';
import IconFlask from '@tabler/icons-react-native/IconFlask';
import IconHistory from '@tabler/icons-react-native/IconHistory';
import IconBolt from '@tabler/icons-react-native/IconBolt';
import IconBoltOff from '@tabler/icons-react-native/IconBoltOff';
import IconLanguage from '@tabler/icons-react-native/IconLanguage';
import IconFileExport from '@tabler/icons-react-native/IconFileExport';
import IconLayoutGridAdd from '@tabler/icons-react-native/IconLayoutGridAdd';
import IconHelpCircle from '@tabler/icons-react-native/IconHelpCircle';
import IconFlag2 from '@tabler/icons-react-native/IconFlag2';

type TablerIcon = ComponentType<{
  size?: number | string;
  color?: string;
  // Tabler RN's prop for line thickness is `strokeWidth` (NOT `stroke` — passing
  // `stroke` poisons the stroke COLOR with a number and the icon renders blank).
  strokeWidth?: number | string;
  style?: StyleProp<ViewStyle>;
}>;

// Maps the app's existing icon names (from both Ionicons + MaterialCommunityIcons)
// to the lab's Tabler icons.
const MAP: Record<string, TablerIcon> = {
  add: IconPlus,
  remove: IconMinus,
  close: IconX,
  'close-circle': IconCircleX,
  checkmark: IconCheck,
  'checkmark-circle': IconCircleCheck,
  'chevron-back': IconChevronLeft,
  'chevron-forward': IconChevronRight,
  'chevron-down': IconChevronDown,
  'arrow-forward': IconArrowRight,
  'arrow-down-right': IconArrowDownRight,
  'alert-circle-outline': IconAlertCircle,
  warning: IconAlertTriangle,
  'information-circle-outline': IconInfoCircle,
  'calendar-outline': IconCalendar,
  'calendar-plus': IconCalendarPlus,
  'time-outline': IconClock,
  camera: IconCamera,
  'camera-outline': IconCamera,
  'camera-reverse-outline': IconCameraRotate,
  images: IconPhoto,
  'cloud-offline-outline': IconCloudOff,
  'compass-outline': IconCompass,
  'create-outline': IconPencil,
  'pencil-outline': IconPencil,
  'document-text-outline': IconFileText,
  'lock-closed-outline': IconLock,
  notifications: IconBell,
  search: IconSearch,
  sparkles: IconSparkles,
  flag: IconFlag,
  'flag-outline': IconFlag,
  target: IconTarget,
  scale: IconScale,
  'scale-bathroom': IconScale,
  leaf: IconLeaf,
  grain: IconLeaf,
  water: IconDroplet,
  droplet: IconDroplet,
  fire: IconFlame,
  flame: IconFlame,
  'food-drumstick': IconMeat,
  nutrition: IconMeat,
  needle: IconVaccine,
  medical: IconVaccine,
  restaurant: IconToolsKitchen2,
  'silverware-fork-knife': IconToolsKitchen2,
  resize: IconRuler2,
  dumbbell: IconBarbell,
  'weight-lifter': IconBarbell,
  run: IconRun,
  walk: IconWalk,
  heart: IconHeart,
  'heart-pulse': IconHeartbeat,
  pulse: IconActivityHeartbeat,
  'shield-check': IconShieldCheck,
  'sad-outline': IconMoodSad,
  sad: IconMoodSad,
  list: IconListDetails,
  rocket: IconRocket,
  mic: IconMicrophone,
  'person-circle': IconUserCircle,
  'person-circle-outline': IconUserCircle,
  home: IconHome2,
  'home-outline': IconHome2,
  bulb: IconBulb,
  'logo-apple': IconBrandApple,
  'logo-google': IconBrandGoogle,
  pill: IconPill,
  'chevron-up': IconChevronUp,
  stop: IconPlayerStopFilled,
  star: IconStar,
  'ellipse-outline': IconCircle,
  'dots-horizontal': IconDots,
  equal: IconEqual,
  'gender-female': IconGenderFemale,
  'gender-male': IconGenderMale,
  'gender-non-binary': IconGenderBigender,
  refresh: IconRefresh,
  restore: IconRestore,
  sleep: IconMoon,
  sofa: IconSofa,
  sprout: IconPlant2,
  'arm-flex': IconStretching,
  'trending-down': IconTrendingDown,
  'tune-variant': IconAdjustmentsHorizontal,
  'white-balance-sunny': IconSun,
  'calendar-range': IconCalendar,
  'calendar-week': IconCalendarWeek,
  'emoticon-sad-outline': IconMoodSad,
  'chart-line': IconChartLine,
  'current-location': IconCurrentLocation,
  flask: IconFlask,
  history: IconHistory,
  'adjustments-horizontal': IconAdjustmentsHorizontal,
  calendar: IconCalendar,
  language: IconLanguage,
  'file-export': IconFileExport,
  'layout-grid-add': IconLayoutGridAdd,
  'help-circle': IconHelpCircle,
  'flag-2': IconFlag2,
  bolt: IconBolt,
  'bolt-off': IconBoltOff,
};

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  stroke?: number;
  style?: StyleProp<ViewStyle>;
}

export function Icon({ name, size = 22, color, stroke = 2.1, style }: IconProps) {
  const Cmp = MAP[name] ?? IconCircle;
  if (!MAP[name] && __DEV__) console.warn(`[Icon] no Tabler mapping for "${name}"`);
  return <Cmp size={size} color={color} strokeWidth={stroke} style={style} />;
}
