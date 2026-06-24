// MealCamera — the "Meal · scan (camera)" lab screen: a full-screen in-app camera
// with a framing rectangle, "Point at your plate" caption, flash toggle, shutter,
// and Scan/Search/Voice chips. On capture it hands the photo URI back to the
// parent, which reads base64 off the bridge hot-path (avoids the iOS freeze that
// `ImagePicker({base64:true})` caused) and runs the AI scan.

import React, { useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Button } from './Button';

export interface MealCameraProps {
  visible: boolean;
  onClose(): void;
  onCapture(uri: string): void;
  onSearch(): void;
  onVoice(): void;
}

export function MealCamera({ visible, onClose, onCapture, onSearch, onVoice }: MealCameraProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing] = useState<CameraType>('back');
  const [torch, setTorch] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const capture = async () => {
    Haptics.selectionAsync().catch(() => undefined);
    const pic = await cameraRef.current?.takePictureAsync({ quality: 0.5 });
    if (pic?.uri) onCapture(pic.uri);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#15161B' }}>
        {!permission?.granted ? (
          <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 }}>
            <Icon name="camera-outline" size={40} color="#fff" />
            <AppText variant="cardTitle" align="center" style={{ color: '#fff' }}>
              Camera access
            </AppText>
            <AppText variant="body" align="center" style={{ color: 'rgba(255,255,255,0.7)', maxWidth: 280 }}>
              Pepta needs your camera to scan a meal. You can also upload from your library or log manually.
            </AppText>
            <View style={{ width: 220, gap: 10 }}>
              <Button label="Allow camera" onPress={() => void requestPermission()} />
              <Pressable onPress={onClose} style={{ alignItems: 'center', paddingVertical: 10 }}>
                <AppText variant="bodyStrong" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Not now
                </AppText>
              </Pressable>
            </View>
          </SafeAreaView>
        ) : (
          <>
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing={facing} enableTorch={torch} />

            <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
              {/* top bar: close + flash */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Icon name="close" size={24} color="#fff" />
                </Pressable>
                <Pressable onPress={() => { Haptics.selectionAsync().catch(() => undefined); setTorch((t) => !t); }} hitSlop={10}>
                  <Icon name={torch ? 'bolt' : 'bolt-off'} size={22} color={torch ? '#FFD54A' : '#fff'} />
                </Pressable>
              </View>

              {/* framing guide */}
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }} pointerEvents="none">
                <View style={{ width: 220, height: 220, borderRadius: 28, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' }} />
                <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  Point at your plate
                </AppText>
              </View>

              {/* shutter + mode chips */}
              <View style={{ alignItems: 'center', gap: 16, paddingBottom: 28 }}>
                <Pressable onPress={() => void capture()} style={{ width: 74, height: 74, borderRadius: 37, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' }} />
                </Pressable>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <ModeChip label="Scan" active />
                  <ModeChip label="Search" onPress={onSearch} />
                  <ModeChip label="Voice" onPress={onVoice} />
                </View>
              </View>
            </SafeAreaView>
          </>
        )}
      </View>
    </Modal>
  );
}

function ModeChip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={() => {
        if (!onPress) return;
        Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      disabled={active}
      style={{
        paddingVertical: 7,
        paddingHorizontal: 16,
        borderRadius: 999,
        backgroundColor: active ? '#fff' : 'rgba(255,255,255,0.16)',
      }}
    >
      <AppText variant="caption" style={{ fontWeight: '700', color: active ? '#15161B' : '#fff' }}>
        {label}
      </AppText>
    </Pressable>
  );
}
