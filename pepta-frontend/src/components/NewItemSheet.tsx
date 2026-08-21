// Adding an item the user typed — the "Add your own" row.
//
// THE KIND IS A CHOICE, NOT A GUESS. A drink's Log adds ounces to the water
// total and it draws as a vessel; a food's Log writes a meal and it draws as a
// tile. Inferring that from a name would put "protein shake" in the wrong tab
// and log it into the wrong number, so the user picks, and the fields change
// to match: a drink asks for a volume, a food asks for protein and calories.
//
// SAVE STAYS DISABLED UNTIL IT COULD ACTUALLY BE LOGGED, and says why rather
// than leaving a dead button — a drink with no volume adds nothing, a food
// with no figures records nothing.

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../services/api';
import { discardLocalCapture } from '../services/localCaptures';
import * as Haptics from 'expo-haptics';
import { AppText, Button } from './index';
import { useTheme } from '../theme';
import {
  isNewItemValid,
  newItemProblem,
  type FavouriteKind,
  type NewItemDraft,
} from '../screens/app/favourites';

export interface NewItemSheetProps {
  visible: boolean;
  /** Which tab it was opened from — the user can still change it. */
  initialKind: FavouriteKind;
  onCancel(): void;
  onSave(draft: NewItemDraft): void;
}

const num = (v: string): number | undefined => {
  const n = Number(v);
  return v.trim().length > 0 && Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function NewItemSheet({ visible, initialKind, onCancel, onSave }: NewItemSheetProps) {
  const theme = useTheme();
  const [kind, setKind] = useState<FavouriteKind>(initialKind);
  const [name, setName] = useState('');
  const [portion, setPortion] = useState('');
  const [protein, setProtein] = useState('');
  const [calories, setCalories] = useState('');
  const [ounces, setOunces] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoMediaId, setPhotoMediaId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  /**
   * The uploaded media id nothing points at yet. A ref, not state, because the
   * cleanup below has to read it at the moment the sheet closes — a stale
   * closure would strand exactly the photo it is there to collect.
   */
  const pending = useRef<string | null>(null);
  /**
   * The device-side twin of `pending`: the cache file behind photoUri, while
   * this sheet is what displays it. Saving hands the URI to the optimistic
   * row in the list, so — exactly like `pending` — saving clears it first
   * and the close-time sweep only ever deletes a file nothing renders.
   */
  const capture = useRef<string | null>(null);
  /**
   * Bumped on every close. An upload that was still in flight when the sheet
   * closed lands in a session that no longer exists — without this check it
   * would repopulate the refs AFTER the close-time sweep ran, and both the
   * media id and the cache file would leak into the next item's session.
   */
  const session = useRef(0);

  /**
   * An upload nothing ended up pointing at. Best-effort — a failed cleanup
   * leaves one stray file, and there is nothing useful to tell the user about
   * a photo they had already walked away from.
   */
  const discard = (mediaId: string | null) => {
    if (mediaId) void api.discardMedia(mediaId).catch(() => undefined);
  };

  // Cleared on every open, or the next item starts as a copy of the last.
  //
  // The close half is where stranded photos get collected. Keying it on the
  // sheet closing rather than on the Cancel button means the backdrop, the
  // hardware back gesture and a parent that simply hides the sheet are all
  // covered by the same line — saving clears `pending` first, so an attached
  // photo is never swept up.
  useEffect(() => {
    if (!visible) {
      session.current += 1;
      discard(pending.current);
      pending.current = null;
      discardLocalCapture(capture.current);
      capture.current = null;
      return;
    }
    setKind(initialKind);
    setName('');
    setPortion('');
    setProtein('');
    setCalories('');
    setOunces('');
    setPhotoUri(null);
    setPhotoMediaId(null);
    setUploading(false);
    setPhotoError('');
  }, [visible, initialKind]);

  // Navigating away with the sheet open never trips the effect above — React
  // runs cleanups on unmount, not effect bodies. Its own effect, so it fires
  // once at the end rather than on every dependency change.
  useEffect(
    () => () => {
      discard(pending.current);
      discardLocalCapture(capture.current);
    },
    [],
  );

  /**
   * Picks, then uploads through the opaque media API. The local URI is shown the moment
   * it is chosen — waiting on a round trip to show a photo the user is already
   * looking at feels broken — and the media id it resolves to is what gets saved.
   */
  const pickPhoto = async () => {
    if (uploading) return;
    Haptics.selectionAsync().catch(() => undefined);
    setPhotoError('');
    const previousUri = photoUri;
    const previousMediaId = pending.current;
    const mySession = session.current;
    let pickedUri: string | null = null;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setPhotoError('Pepta needs photos access to add one. You can save without it.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ['images'] });
      const asset = res.canceled ? null : res.assets[0];
      if (!asset?.uri) return;
      pickedUri = asset.uri;
      setPhotoUri(asset.uri);
      setUploading(true);
      const contentType =
        asset.mimeType === 'image/png' ||
        asset.mimeType === 'image/webp' ||
        asset.mimeType === 'image/heic'
          ? asset.mimeType
          : 'image/jpeg';
      const ready = await api.uploadMediaPhoto({
        intent: 'favourite_photo',
        uri: asset.uri,
        contentType,
      });
      if (session.current !== mySession) {
        // The sheet closed while this upload was in flight, and the close
        // sweep already collected the session's refs. This result belongs to
        // nothing — writing it into the refs would leak it into the NEXT
        // item's session, so it is cleaned up here instead.
        discard(ready.mediaId);
        discardLocalCapture(asset.uri);
        return;
      }
      // The one this replaces is now referenced by nothing — the server copy
      // AND the cache file behind it. Fire and forget: it is housekeeping,
      // and the photo they just picked is what matters.
      discard(previousMediaId);
      if (previousUri && previousUri !== asset.uri) discardLocalCapture(previousUri);
      pending.current = ready.mediaId;
      capture.current = asset.uri;
      setPhotoMediaId(ready.mediaId);
    } catch {
      // The failed pick is displayed nowhere either way; its cache copy can
      // go (the kept previous photo's file is what capture holds).
      if (pickedUri && pickedUri !== previousUri) discardLocalCapture(pickedUri);
      if (session.current !== mySession) return;
      // The item is still saveable — the photo is the optional part, and
      // losing what they typed because an upload failed would be the worse
      // outcome.
      setPhotoUri(previousMediaId ? previousUri : null);
      setPhotoMediaId(previousMediaId);
      setPhotoError('That photo did not upload. You can save without it, or try another.');
    } finally {
      setUploading(false);
    }
  };

  if (!visible) return null;

  const draft: NewItemDraft = {
    kind,
    name,
    portion,
    ...(photoMediaId ? { photoMediaId, photoUri: photoUri ?? undefined } : {}),
    ...(kind === 'drink'
      ? { ounces: num(ounces) }
      : { protein: num(protein), calories: num(calories) }),
  };
  const problem = newItemProblem(draft);

  const field = (
    label: string,
    value: string,
    onChangeText: (v: string) => void,
    keyboard: 'default' | 'decimal-pad',
    placeholder?: string,
  ) => (
    <View style={{ flex: 1 }}>
      <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, fontWeight: '700' }}>
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboard}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textTertiary}
        style={{
          marginTop: 5,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 12,
          backgroundColor: theme.colors.surfaceAlt,
          color: theme.colors.textPrimary,
          fontSize: 14,
          fontWeight: '700',
        }}
      />
    </View>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Close the new item form"
        style={{ flex: 1, backgroundColor: 'rgba(14,14,18,0.35)', justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            padding: 20,
            paddingBottom: 30,
          }}
        >
          <AppText variant="cardTitle" style={{ fontSize: 17 }}>Add your own</AppText>
          <AppText variant="caption" color="textTertiary" style={{ fontSize: 11, marginTop: 4, lineHeight: 16 }}>
            Anything the examples do not cover. What it is decides where it
            lands and what logging it does.
          </AppText>

          {/* Segmented, like the tabs — one control, one selection. */}
          <View
            style={{
              flexDirection: 'row',
              gap: 3,
              padding: 3,
              marginTop: 14,
              borderRadius: 14,
              backgroundColor: theme.colors.surfaceAlt,
            }}
          >
            {(['food', 'drink'] as const).map((k) => (
              <Pressable
                key={k}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  setKind(k);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: kind === k }}
                accessibilityLabel={k === 'food' ? 'It is a food' : 'It is a drink'}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 11,
                  alignItems: 'center',
                  backgroundColor: kind === k ? theme.colors.surface : 'transparent',
                  opacity: pressed ? 0.72 : 1,
                })}
              >
                <AppText
                  variant="caption"
                  style={{
                    fontSize: 12.5,
                    fontWeight: kind === k ? '800' : '700',
                    color: kind === k ? theme.colors.textPrimary : theme.colors.textTertiary,
                  }}
                >
                  {k === 'food' ? 'Food' : 'Drink'}
                </AppText>
              </Pressable>
            ))}
          </View>

          {/* The photo. Optional, and never blocks saving. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 }}>
            <Pressable
              onPress={pickPhoto}
              accessibilityRole="button"
              accessibilityLabel={photoUri ? 'Change the photo' : 'Add a photo'}
              style={({ pressed }) => ({
                width: 64,
                height: 64,
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: theme.colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
              ) : (
                <AppText variant="caption" color="textTertiary" style={{ fontSize: 20, lineHeight: 24 }}>
                  +
                </AppText>
              )}
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="caption" color="textSecondary" style={{ fontSize: 12, fontWeight: '700' }}>
                {photoUri ? 'Photo added' : 'Add a photo'}
              </AppText>
              <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 2, lineHeight: 14 }}>
                {uploading ? 'Uploading…' : photoError || 'Optional. It shows on the item’s own screen.'}
              </AppText>
            </View>
            {uploading ? <ActivityIndicator color={theme.colors.textTertiary} /> : null}
          </View>

          <View style={{ marginTop: 12 }}>{field('Name', name, setName, 'default', 'Desk bottle')}</View>
          <View style={{ marginTop: 12 }}>
            {field('How much one is', portion, setPortion, 'default', kind === 'drink' ? '21 oz' : '1 scoop, milk')}
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            {kind === 'drink'
              ? field('Ounces', ounces, setOunces, 'decimal-pad')
              : field('Protein (g)', protein, setProtein, 'decimal-pad')}
            {kind === 'food' ? field('Calories', calories, setCalories, 'decimal-pad') : <View style={{ flex: 1 }} />}
          </View>

          {/* Says why, rather than leaving a dead button. */}
          {problem ? (
            <AppText variant="caption" color="textTertiary" style={{ fontSize: 11, marginTop: 10 }}>
              {problem}
            </AppText>
          ) : null}

          <View style={{ marginTop: 14 }}>
            <Button
              label={uploading ? 'Uploading photo…' : 'Save it'}
              disabled={!isNewItemValid(draft) || uploading}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                // The item owns the photo now, so the cleanup must not take
                // it — and the optimistic row keeps rendering the local file,
                // so the close-time sweep must not take that either.
                pending.current = null;
                capture.current = null;
                onSave(draft);
              }}
            />
          </View>
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={({ pressed }) => ({ alignSelf: 'center', paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}
          >
            <AppText variant="caption" color="textSecondary" style={{ fontSize: 12.5, fontWeight: '700' }}>
              Cancel
            </AppText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
