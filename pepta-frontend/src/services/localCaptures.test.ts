// The one property that matters: this can only ever delete a file:// URI
// inside our own cache directory. Everything else is the user's data and
// must be refused, whatever the caller passes.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  exists: true,
  deleteFn: vi.fn(),
  cacheUri: 'file:///data/app/cache/',
}));

vi.mock('expo-file-system', () => ({
  File: vi.fn(() => ({
    get exists() {
      return fs.exists;
    },
    delete: fs.deleteFn,
  })),
  Paths: {
    get cache() {
      return { uri: fs.cacheUri };
    },
  },
}));

import { File } from 'expo-file-system';
import { discardLocalCapture, isDisposableCaptureUri } from './localCaptures';

beforeEach(() => {
  vi.clearAllMocks();
  fs.exists = true;
  fs.cacheUri = 'file:///data/app/cache/';
});

describe('the ownership guard', () => {
  it('accepts a picker copy inside our cache', () => {
    expect(isDisposableCaptureUri('file:///data/app/cache/ImagePicker/a.jpg')).toBe(true);
  });

  it('tolerates a cache root reported without its trailing slash', () => {
    fs.cacheUri = 'file:///data/app/cache';
    expect(isDisposableCaptureUri('file:///data/app/cache/Camera/b.jpg')).toBe(true);
    // The slash is appended, not just prefix-matched: a sibling directory
    // that merely starts with the same characters is NOT ours.
    expect(isDisposableCaptureUri('file:///data/app/cachesneaky/c.jpg')).toBe(false);
  });

  it.each([
    ['a photo-library asset', 'ph://ABCD-1234'],
    ['an android document', 'content://media/external/images/1'],
    ['a remote url', 'https://example.com/x.jpg'],
    ['a file outside the cache', 'file:///data/app/Documents/keep.jpg'],
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
  ])('refuses %s', (_name, uri) => {
    expect(isDisposableCaptureUri(uri)).toBe(false);
  });

  // The prefix check runs on the raw string but File normalizes afterwards —
  // a dot-segment URI would pass the prefix yet resolve outside the cache.
  it.each([
    ['plain traversal', 'file:///data/app/cache/../Documents/keep.jpg'],
    ['nested traversal', 'file:///data/app/cache/ImagePicker/../../Documents/keep.jpg'],
    ['trailing parent', 'file:///data/app/cache/..'],
    ['current-dir segment', 'file:///data/app/cache/./a.jpg'],
    ['percent-encoded traversal', 'file:///data/app/cache/%2e%2e/Documents/keep.jpg'],
    ['mixed-case encoding', 'file:///data/app/cache/%2E%2e/Documents/keep.jpg'],
  ])('refuses %s even though it starts with the cache root', (_name, uri) => {
    expect(isDisposableCaptureUri(uri)).toBe(false);
  });
});

describe('discardLocalCapture', () => {
  it('deletes an owned capture that exists', () => {
    discardLocalCapture('file:///data/app/cache/ImagePicker/a.jpg');
    expect(File).toHaveBeenCalledWith('file:///data/app/cache/ImagePicker/a.jpg');
    expect(fs.deleteFn).toHaveBeenCalledTimes(1);
  });

  it('touches nothing for a refused URI', () => {
    discardLocalCapture('file:///data/app/Documents/keep.jpg');
    expect(File).not.toHaveBeenCalled();
    expect(fs.deleteFn).not.toHaveBeenCalled();
  });

  it('skips the delete when the file is already gone', () => {
    fs.exists = false;
    discardLocalCapture('file:///data/app/cache/ImagePicker/a.jpg');
    expect(fs.deleteFn).not.toHaveBeenCalled();
  });

  it('swallows filesystem failures — housekeeping never throws into a UI flow', () => {
    fs.deleteFn.mockImplementation(() => {
      throw new Error('EBUSY');
    });
    expect(() =>
      discardLocalCapture('file:///data/app/cache/ImagePicker/a.jpg'),
    ).not.toThrow();
  });

  it('refuses everything when the filesystem module cannot vouch for the cache root', () => {
    // A partially-mocked or failed native module must fail CLOSED.
    fs.cacheUri = undefined as unknown as string;
    expect(() =>
      discardLocalCapture('file:///data/app/cache/ImagePicker/a.jpg'),
    ).not.toThrow();
    expect(fs.deleteFn).not.toHaveBeenCalled();
  });
});
