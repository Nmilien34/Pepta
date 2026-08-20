// Cleanup for temporary device captures.
//
// Every photo flow starts with a file the OS never cleans up for us promptly:
// expo-image-picker copies the chosen image into our cache directory, and the
// in-app cameras write their captures there too. Uploading reads the file —
// nothing deletes it, so before this existed every avatar change, favourite
// photo and meal scan left a full-resolution image in the cache forever.
//
// The guard matters more than the delete: this must never be able to touch a
// user's actual photo library. It only ever removes a file:// URI that sits
// inside our own cache directory — which is exactly where (and only where)
// picker copies and camera captures live. Anything else (ph:// asset URLs,
// content:// documents, remote URLs, files in Documents) is refused.

import { File, Paths } from 'expo-file-system';

export function isDisposableCaptureUri(uri: string | null | undefined): uri is string {
  if (!uri || !uri.startsWith('file://')) return false;
  // The prefix check below happens on the RAW string, but File normalizes
  // the path afterwards — so "<cacheRoot>/../Documents/x.jpg" would pass the
  // prefix test yet resolve outside the cache. No capture URI ever contains
  // dot segments (plain or percent-encoded); anything that does is refused
  // outright rather than trusted to normalization.
  if (/(^|\/)\.\.?(\/|$)/.test(uri) || /%2e/i.test(uri)) return false;
  try {
    const cacheRoot = Paths.cache.uri.endsWith('/')
      ? Paths.cache.uri
      : `${Paths.cache.uri}/`;
    return uri.startsWith(cacheRoot);
  } catch {
    // No answer from the filesystem module means no proof of ownership —
    // and no proof means no delete.
    return false;
  }
}

/**
 * Deletes a spent capture. Call it only once nothing renders the URI any
 * more — a closed sheet, a replaced pick, a finished upload. Best-effort:
 * failing to delete leaves one stray cache file, which is the status quo
 * this exists to improve on, so there is nothing to tell the user.
 */
export function discardLocalCapture(uri: string | null | undefined): void {
  if (!isDisposableCaptureUri(uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Housekeeping only.
  }
}
