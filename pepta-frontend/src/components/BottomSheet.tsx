// BottomSheet — a Modal-backed sheet that slides up over a fading backdrop and
// animates back out before unmounting (internal `render` mirrors `visible`).
// Same motion the QuickLog sheet uses, factored out for reuse.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

const OFFSCREEN = 600;

export interface BottomSheetProps {
  visible: boolean;
  onClose(): void;
  onDismissed?: () => void;
  scrollable?: boolean;
  height?: ViewStyle['height'];
  avoidKeyboard?: boolean;
  children: React.ReactNode;
}

export function BottomSheet({ visible, onClose, onDismissed, scrollable, height, avoidKeyboard = true, children }: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [render, setRender] = useState(visible);
  const backdrop = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(OFFSCREEN)).current;

  const resolvedHeight =
    typeof height === 'string' && height.endsWith('%')
      ? Math.round((window.height * Number.parseFloat(height)) / 100) + insets.bottom
      : height;
  const resolvedMaxHeight = Math.round(window.height * 0.88) + insets.bottom;

  useEffect(() => {
    if (visible) {
      setRender(true);
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 14 }),
      ]).start();
    } else if (render) {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slide, { toValue: OFFSCREEN, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(() => {
        setRender(false);
        onDismissed?.();
      });
    }
  }, [visible]);

  return (
    <Modal visible={render} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={{ flex: 1, backgroundColor: 'rgba(14,14,18,0.45)', opacity: backdrop }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <KeyboardAvoidingView
        pointerEvents="box-none"
        behavior={avoidKeyboard && Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ position: 'absolute', left: 0, right: 0, bottom: -insets.bottom }}
      >
        <Animated.View
          style={{
            transform: [{ translateY: slide }],
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            overflow: 'hidden',
            ...(resolvedHeight ? { height: resolvedHeight } : { maxHeight: resolvedMaxHeight }),
          }}
        >
          <SafeAreaView edges={['bottom']} style={resolvedHeight ? { flex: 1 } : { maxHeight: '100%' }}>
            {scrollable ? (
              <ScrollView
                style={resolvedHeight ? { flex: 1 } : undefined}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 22 }}
              >
                <View style={{ width: 38, height: 5, borderRadius: 999, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 14 }} />
                {children}
              </ScrollView>
            ) : (
              <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 22 }}>
                <View style={{ width: 38, height: 5, borderRadius: 999, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 14 }} />
                {children}
              </View>
            )}
          </SafeAreaView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
