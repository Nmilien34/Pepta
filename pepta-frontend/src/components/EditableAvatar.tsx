import React, { useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "../context/AuthContext";
import {
  pickAvatar,
  uploadAvatar,
  type AvatarSource,
} from "../services/avatar.service";
import { useTheme } from "../theme";
import { Icon } from "./Icon";
import { UserAvatar } from "./UserAvatar";

interface EditableAvatarProps {
  size?: number;
}

export function EditableAvatar({ size = 62 }: EditableAvatarProps) {
  const theme = useTheme();
  const { updateCachedUser } = useAuth();
  const [busy, setBusy] = useState(false);

  const runUpload = async (source: AvatarSource) => {
    try {
      setBusy(true);
      const picked = await pickAvatar(source);
      if (!picked) return;
      const updated = await uploadAvatar(picked);
      updateCachedUser(updated);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Try again in a moment.";
      Alert.alert("Couldn’t update photo", message);
    } finally {
      setBusy(false);
    }
  };

  // Source chooser as a native action sheet with no explanatory copy. App
  // Review (5.1.1(iv)) reads a custom titled message + Cancel shown before the
  // camera/photos permission as a pre-permission gate; a bare action menu that
  // flows straight into the system prompt is the compliant pattern.
  const openPicker = () => {
    if (busy) return;
    Haptics.selectionAsync().catch(() => undefined);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Choose from Library", "Take Photo", "Cancel"],
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) void runUpload("library");
          if (index === 1) void runUpload("camera");
        },
      );
      return;
    }
    Alert.alert("", "", [
      { text: "Choose from Library", onPress: () => void runUpload("library") },
      { text: "Take Photo", onPress: () => void runUpload("camera") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const badgeSize = Math.max(22, Math.round(size * 0.35));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Edit profile photo"
      onPress={openPicker}
      disabled={busy}
      style={{ width: size, height: size }}
    >
      <UserAvatar size={size} />
      {busy ? (
        <View
          style={[
            styles.overlay,
            {
              borderRadius: size / 2,
              backgroundColor: "rgba(16, 13, 28, 0.38)",
            },
          ]}
        >
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
      <View
        style={[
          styles.badge,
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
            backgroundColor: theme.colors.primary,
          },
        ]}
      >
        <Icon
          name="pencil-outline"
          size={Math.round(badgeSize * 0.52)}
          color="#fff"
          stroke={2.4}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
});
