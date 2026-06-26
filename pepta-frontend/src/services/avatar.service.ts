import type { AvatarUploadIntentRequest, User } from "@pepta/shared";
import * as ImagePicker from "expo-image-picker";
import { api as peptaApi } from "./api";

type AvatarContentType = AvatarUploadIntentRequest["contentType"];

export type AvatarSource = "library" | "camera";

export interface PickedAvatar {
  uri: string;
  contentType: AvatarContentType;
}

function normalizeContentType(
  mime: string | undefined,
  uri: string,
): AvatarContentType {
  const normalized = (mime ?? "").toLowerCase();
  if (normalized === "image/png") return "image/png";
  if (normalized === "image/webp") return "image/webp";
  if (normalized === "image/heic") return "image/heic";
  if (normalized === "image/jpeg" || normalized === "image/jpg") {
    return "image/jpeg";
  }

  const path = uri.split("?").at(0) ?? uri;
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  return "image/jpeg";
}

const pickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.86,
};

export async function pickAvatar(
  source: AvatarSource,
): Promise<PickedAvatar | null> {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Camera access is needed to take a profile photo.");
    }

    const result = await ImagePicker.launchCameraAsync(pickerOptions);
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    return {
      uri: asset.uri,
      contentType: normalizeContentType(asset.mimeType, asset.uri),
    };
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Photo access is needed to choose a profile picture.");
  }

  const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    contentType: normalizeContentType(asset.mimeType, asset.uri),
  };
}

interface AvatarApi {
  createAvatarUploadIntent: typeof peptaApi.createAvatarUploadIntent;
  confirmAvatarUpload: typeof peptaApi.confirmAvatarUpload;
}

export async function uploadAvatar(
  picked: PickedAvatar,
  deps: { api?: AvatarApi; fetchImpl?: typeof fetch } = {},
): Promise<User> {
  const api = deps.api ?? peptaApi;
  const fetchImpl = deps.fetchImpl ?? fetch;

  const fileResponse = await fetchImpl(picked.uri);
  const blob = await fileResponse.blob();
  const intent = await api.createAvatarUploadIntent({
    contentType: picked.contentType,
    sizeBytes: blob.size || undefined,
  });

  const uploadResponse = await fetchImpl(intent.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": picked.contentType },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error("Profile photo upload failed. Please try again.");
  }

  return api.confirmAvatarUpload({ key: intent.key });
}
