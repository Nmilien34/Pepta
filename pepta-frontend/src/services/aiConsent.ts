import AsyncStorage from "@react-native-async-storage/async-storage";

export const AI_CONSENT_STORAGE_KEY = "pepta.aiDataSharingConsent.v1";
const AI_CONSENT_ACCEPTED = "accepted";

export async function hasAIDataSharingConsent(): Promise<boolean> {
  return (await AsyncStorage.getItem(AI_CONSENT_STORAGE_KEY)) === AI_CONSENT_ACCEPTED;
}

export async function saveAIDataSharingConsent(): Promise<void> {
  await AsyncStorage.setItem(AI_CONSENT_STORAGE_KEY, AI_CONSENT_ACCEPTED);
}
