export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';

// Native Google sign-in client IDs. The web client ID MUST match the backend's
// GOOGLE_CLIENT_ID (the audience it verifies). See .env.example.
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

// Legal pages (served by the backend once deployed; placeholders for now).
export const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://pepta.app/terms';
export const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://pepta.app/privacy';
