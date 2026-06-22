// ProgressPhotoCapture — the "Progress photo · capture" + "saved" flow. A
// full-screen camera with a body-silhouette overlay + shutter, then the 3-step
// presigned-S3 upload (intent → PUT → confirm), then a saved confirmation card.
// Needs the live backend for the presigned URL; in dev it lands on the error card.

import React, { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { api } from '../services/api';
import { formatShortDate } from '../screens/app/progressView';

type Stage = 'camera' | 'uploading' | 'saved' | 'error';

export interface ProgressPhotoCaptureProps {
  visible: boolean;
  onClose(): void;
  onSaved(): void;
  recentPhotos: { id: string; captureDate: string; viewUrl?: string }[];
}

function todayDateOnly(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ProgressPhotoCapture({ visible, onClose, onSaved, recentPhotos }: ProgressPhotoCaptureProps) {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>('camera');
  const [facing, setFacing] = useState<CameraType>('back');
  const cameraRef = React.useRef<CameraView>(null);

  // Reset to the camera each time the modal opens.
  React.useEffect(() => {
    if (visible) setStage('camera');
  }, [visible]);

  const capture = async () => {
    Haptics.selectionAsync().catch(() => undefined);
    try {
      const pic = await cameraRef.current?.takePictureAsync({ quality: 0.6 });
      if (!pic?.uri) return;
      setStage('uploading');
      const intent = await api.createPhotoUploadIntent({ captureDate: todayDateOnly(), contentType: 'image/jpeg', kind: 'body' });
      await api.uploadToPresignedUrl(intent.uploadUrl, pic.uri, 'image/jpeg');
      await api.confirmPhoto({ photoId: intent.photo.id });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      onSaved();
      setStage('saved');
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setStage('error');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#15161B' }}>
        {/* permission gate */}
        {!permission?.granted ? (
          <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 }}>
            <Ionicons name="camera-outline" size={40} color="#fff" />
            <AppText variant="cardTitle" align="center" style={{ color: '#fff' }}>
              Camera access
            </AppText>
            <AppText variant="body" align="center" style={{ color: 'rgba(255,255,255,0.7)', maxWidth: 280 }}>
              Pepta needs your camera to capture progress photos. They stay private to your account.
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
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing={facing} />

            {/* overlays sit above the camera */}
            <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
              {/* top bar */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Ionicons name="close" size={26} color="#fff" />
                </Pressable>
                <View style={{ backgroundColor: 'rgba(0,0,0,0.4)', paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999 }}>
                  <AppText variant="caption" style={{ color: '#fff', fontWeight: '700' }}>
                    {formatShortDate(todayDateOnly())}
                  </AppText>
                </View>
                <Pressable onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))} hitSlop={10}>
                  <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
                </Pressable>
              </View>

              {/* body silhouette guide */}
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
                <Silhouette />
              </View>

              {/* shutter */}
              {stage === 'camera' ? (
                <View style={{ alignItems: 'center', gap: 16, paddingBottom: 28 }}>
                  <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    Line up with the outline
                  </AppText>
                  <Pressable onPress={() => void capture()} style={{ width: 74, height: 74, borderRadius: 37, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' }} />
                  </Pressable>
                </View>
              ) : (
                <View style={{ height: 118 }} />
              )}
            </SafeAreaView>

            {/* uploading veil */}
            {stage === 'uploading' ? (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(14,14,18,0.55)', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                <ActivityIndicator color="#fff" />
                <AppText variant="body" style={{ color: '#fff' }}>
                  Saving your photo…
                </AppText>
              </View>
            ) : null}

            {/* saved confirmation */}
            {stage === 'saved' ? (
              <SavedCard theme={theme} recentPhotos={recentPhotos} onDone={onClose} />
            ) : null}

            {/* error */}
            {stage === 'error' ? (
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
                <SafeAreaView edges={['bottom']}>
                  <View style={{ padding: 20, alignItems: 'center', gap: 12 }}>
                    <Ionicons name="cloud-offline-outline" size={30} color={theme.colors.warning} />
                    <AppText variant="cardTitle" align="center">
                      Couldn’t save the photo
                    </AppText>
                    <AppText variant="body" color="textSecondary" align="center" style={{ maxWidth: 280 }}>
                      Check your connection and try again.
                    </AppText>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                      <View style={{ flex: 1 }}>
                        <Button label="Retry" onPress={() => setStage('camera')} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button label="Close" variant="secondary" onPress={onClose} />
                      </View>
                    </View>
                  </View>
                </SafeAreaView>
              </View>
            ) : null}
          </>
        )}
      </View>
    </Modal>
  );
}

function SavedCard({ theme, recentPhotos, onDone }: { theme: ReturnType<typeof useTheme>; recentPhotos: { id: string; captureDate: string; viewUrl?: string }[]; onDone: () => void }) {
  const recent = recentPhotos.slice(0, 2);
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
      <SafeAreaView edges={['bottom']}>
        <View style={{ padding: 20, alignItems: 'center' }}>
          <View style={{ width: 38, height: 5, borderRadius: 999, backgroundColor: theme.colors.border, marginBottom: 14 }} />
          <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#E8F8EE', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={28} color="#1E8E40" />
          </View>
          <AppText variant="cardTitle" style={{ fontSize: 17, marginTop: 10 }}>
            Added to your gallery
          </AppText>
          <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
            {formatShortDate(new Date().toISOString())}
          </AppText>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, alignSelf: 'stretch' }}>
            {recent.map((p) => (
              <View key={p.id} style={{ flex: 1, aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' }}>
                {p.viewUrl ? <Image source={{ uri: p.viewUrl }} style={{ position: 'absolute', width: '100%', height: '100%' }} /> : null}
                <View style={{ width: '100%', paddingVertical: 3, backgroundColor: 'rgba(0,0,0,0.25)' }}>
                  <AppText variant="caption" align="center" style={{ fontSize: 10, color: '#fff' }}>
                    {formatShortDate(p.captureDate)}
                  </AppText>
                </View>
              </View>
            ))}
            <View style={{ flex: 1, aspectRatio: 3 / 4, borderRadius: 12, borderWidth: 2, borderColor: theme.colors.primary, backgroundColor: '#F3EFFF', alignItems: 'center', justifyContent: 'center' }}>
              <AppText variant="caption" style={{ fontSize: 10, color: theme.colors.primary, fontWeight: '700' }}>
                Today
              </AppText>
            </View>
          </View>
          <View style={{ alignSelf: 'stretch', marginTop: 18 }}>
            <Button label="Done" onPress={onDone} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

// Body outline guide (same silhouette shapes as BodyMap, white + low opacity).
function Silhouette() {
  const fill = 'rgba(255,255,255,0.32)';
  return (
    <Svg width={150} height={281} viewBox="0 0 80 150">
      <Circle cx={40} cy={12} r={10} fill={fill} />
      <Rect x={14} y={24} width={9} height={42} rx={4.5} fill={fill} />
      <Rect x={57} y={24} width={9} height={42} rx={4.5} fill={fill} />
      <Path d="M27 25 Q40 22 53 25 L50 70 Q40 74 30 70 Z" fill={fill} />
      <Rect x={29} y={66} width={22} height={13} rx={6} fill={fill} />
      <Rect x={29} y={78} width={10} height={62} rx={5} fill={fill} />
      <Rect x={41} y={78} width={10} height={62} rx={5} fill={fill} />
    </Svg>
  );
}
