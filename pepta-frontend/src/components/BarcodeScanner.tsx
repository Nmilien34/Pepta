import React, { useEffect, useRef, useState } from "react";
import { Linking, Modal, Pressable, View } from "react-native";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import * as Haptics from "expo-haptics";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Icon } from "./Icon";

export interface BarcodeScannerProps {
  visible: boolean;
  onClose(): void;
  onScanned(code: string): void;
  onManual(): void;
}

export function BarcodeScanner({
  visible,
  onClose,
  onScanned,
  onManual,
}: BarcodeScannerProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const handledRef = useRef(false);
  const cameraDenied = permission?.status === "denied";

  useEffect(() => {
    if (visible) {
      handledRef.current = false;
      setTorch(false);
    }
  }, [visible]);

  const handleBarcode = (result: BarcodeScanningResult) => {
    if (handledRef.current) return;
    const code = result.data?.replace(/\D/g, "");
    if (!code || code.length < 6) return;
    handledRef.current = true;
    Haptics.selectionAsync().catch(() => undefined);
    onScanned(code);
  };

  const openSettings = () => {
    Linking.openSettings().catch(() => undefined);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: "#15161B" }}>
        {!permission?.granted ? (
          <SafeAreaView
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: 28,
              gap: 16,
            }}
          >
            <Icon name="barcode-outline" size={40} color="#fff" />
            <AppText variant="cardTitle" align="center" style={{ color: "#fff" }}>
              {cameraDenied ? "Camera is off" : "Camera access"}
            </AppText>
            <AppText
              variant="body"
              align="center"
              style={{
                color: "rgba(255,255,255,0.7)",
                maxWidth: 280,
              }}
            >
              {cameraDenied
                ? "Turn camera access on in Settings, or enter the product manually."
                : "Pepta needs your camera to read a product barcode."}
            </AppText>
            <View style={{ width: 220, gap: 10 }}>
              {cameraDenied ? (
                <>
                  <Button label="Open Settings" onPress={openSettings} />
                  <Button
                    label="Enter manually"
                    variant="secondary"
                    onPress={onManual}
                  />
                </>
              ) : (
                <Button label="Continue" onPress={() => void requestPermission()} />
              )}
            </View>
          </SafeAreaView>
        ) : (
          <>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              enableTorch={torch}
              onBarcodeScanned={handleBarcode}
              barcodeScannerSettings={{
                barcodeTypes: [
                  "ean13",
                  "ean8",
                  "upc_a",
                  "upc_e",
                  "code128",
                  "code39",
                ],
              }}
            />

            <SafeAreaView
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
              pointerEvents="box-none"
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 16,
                  paddingTop: Math.max(insets.top + 10, 34),
                }}
              >
                <Pressable
                  onPress={onClose}
                  hitSlop={10}
                  style={cameraButtonStyle}
                  accessibilityRole="button"
                  accessibilityLabel="Close barcode scanner"
                >
                  <Icon name="close" size={24} color="#fff" />
                </Pressable>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setTorch((value) => !value);
                  }}
                  hitSlop={10}
                  style={cameraButtonStyle}
                  accessibilityRole="button"
                  accessibilityLabel={torch ? "Turn flash off" : "Turn flash on"}
                >
                  <Icon
                    name={torch ? "bolt" : "bolt-off"}
                    size={22}
                    color={torch ? "#FFD54A" : "#fff"}
                  />
                </Pressable>
              </View>

              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 16,
                }}
                pointerEvents="none"
              >
                <View
                  style={{
                    width: 260,
                    height: 150,
                    borderRadius: 24,
                    borderWidth: 2,
                    borderColor: "rgba(255,255,255,0.75)",
                  }}
                />
                <AppText
                  variant="caption"
                  style={{ color: "rgba(255,255,255,0.85)" }}
                >
                  Line up the barcode
                </AppText>
              </View>
            </SafeAreaView>
          </>
        )}
      </View>
    </Modal>
  );
}

const cameraButtonStyle = {
  width: 44,
  height: 44,
  borderRadius: 22,
  backgroundColor: "rgba(0,0,0,0.32)",
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
