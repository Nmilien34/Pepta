import { describe, expect, it } from 'vitest';
import { toCsv } from '../../lib/csv';

describe('toCsv', () => {
  it('joins header and rows with CRLF and a trailing newline', () => {
    expect(toCsv(['a', 'b'], [['1', '2']])).toBe('a,b\r\n1,2\r\n');
  });

  it('quotes fields containing commas, quotes, and newlines (RFC 4180)', () => {
    const csv = toCsv(
      ['notes'],
      [['felt fine, mostly'], ['said "ouch"'], ['line one\nline two']],
    );
    expect(csv).toBe(
      'notes\r\n"felt fine, mostly"\r\n"said ""ouch"""\r\n"line one\nline two"\r\n',
    );
  });

  it('leaves plain fields unquoted', () => {
    expect(toCsv(['compound'], [['Tirzepatide']])).toBe('compound\r\nTirzepatide\r\n');
  });
});
