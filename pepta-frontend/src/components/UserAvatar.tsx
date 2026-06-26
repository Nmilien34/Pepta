import React, { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { useTheme } from "../theme";
import { AppText } from "./AppText";

interface UserAvatarProps {
  size?: number;
}

export function UserAvatar({ size = 44 }: UserAvatarProps) {
  const theme = useTheme();
  const { isAuthenticated, user } = useAuth();
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user?.hasAvatar) {
      setUploadedUrl(null);
      return;
    }

    let cancelled = false;
    api
      .getAvatarViewUrl()
      .then((result) => {
        if (!cancelled) setUploadedUrl(result.viewUrl);
      })
      .catch(() => {
        if (!cancelled) setUploadedUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.hasAvatar, user?.id, user?.updatedAt]);

  const imageUri = uploadedUrl ?? user?.avatarUrl ?? null;
  const dimensions = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  if (imageUri) {
    return (
      <Image
        source={{ uri: imageUri }}
        resizeMode="cover"
        style={[styles.avatar, dimensions]}
      />
    );
  }

  const source = user?.displayName ?? user?.email ?? "P";
  const initial = source.trim().charAt(0).toUpperCase() || "P";

  return (
    <LinearGradient
      colors={["#F1ECFF", "#DCD1FF"] as const}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.avatar, dimensions]}
    >
      <View
        style={[
          styles.innerRing,
          {
            width: size - 6,
            height: size - 6,
            borderRadius: (size - 6) / 2,
          },
        ]}
      >
        <AppText
          variant="bodyStrong"
          color="primary"
          style={{
            fontSize: Math.max(16, Math.round(size * 0.4)),
            fontWeight: "900",
            color: theme.colors.primary,
          }}
        >
          {initial}
        </AppText>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFEBFF",
    overflow: "hidden",
  },
  innerRing: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.58)",
  },
});
