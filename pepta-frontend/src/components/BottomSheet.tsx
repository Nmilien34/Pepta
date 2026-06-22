// BottomSheet — a Modal-backed sheet that slides up over a fading backdrop and
// animates back out before unmounting (internal `render` mirrors `visible`).
// Same motion the QuickLog sheet uses, factored out for reuse.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

const OFFSCREEN = 600;

export interface BottomSheetProps {
  visible: boolean;
  onClose(): void;
  children: React.ReactNode;
}

export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const theme = useTheme();
  const [render, setRender] = useState(visible);
  const backdrop = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(OFFSCREEN)).current;

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
      ]).start(() => setRender(false));
    }
  }, [visible]);

  return (
    <Modal visible={render} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={{ flex: 1, backgroundColor: 'rgba(14,14,18,0.45)', opacity: backdrop }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          transform: [{ translateY: slide }],
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          maxHeight: '88%',
        }}
      >
        <SafeAreaView edges={['bottom']}>
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 22 }}>
            <View style={{ width: 38, height: 5, borderRadius: 999, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 14 }} />
            {children}
          </View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}
