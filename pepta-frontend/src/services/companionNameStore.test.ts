import { describe, expect, it } from 'vitest';
import { parseStoredCompanionName } from './companionNameStore';

describe('parseStoredCompanionName', () => {
  it('reads a stored pick and its sync state', () => {
    expect(parseStoredCompanionName('{"name":"Sushi","synced":false}')).toEqual({
      name: 'Sushi',
      synced: false,
    });
    expect(parseStoredCompanionName('{"name":"Bean","synced":true}')).toEqual({
      name: 'Bean',
      synced: true,
    });
  });

  it('trims, and treats a missing synced flag as unsynced', () => {
    // Unsynced is the safe default: the worst case is one redundant retry,
    // whereas assuming synced would silently drop the name forever.
    expect(parseStoredCompanionName('{"name":"  Otto  "}')).toEqual({
      name: 'Otto',
      synced: false,
    });
  });

  it('reads corrupt or hostile input as "nothing stored" instead of throwing', () => {
    for (const raw of [
      null,
      '',
      'not json',
      '{}',
      '[]',
      '{"name":""}',
      '{"name":"   "}',
      '{"name":123}',
      'null',
    ]) {
      expect(parseStoredCompanionName(raw)).toBeNull();
    }
  });
});
