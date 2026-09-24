import { describe, expect, it } from 'vitest';
import { matchesAccept } from '../src/file-inputs.js';

describe('accept matching', () => {
  it('accepts anything without an accept list', () => {
    expect(matchesAccept('./a.bin', undefined)).toBe(true);
    expect(matchesAccept('./a.bin', ' ')).toBe(true);
  });
  it('matches extensions case-insensitively', () => {
    expect(matchesAccept('./ID.PDF', '.pdf')).toBe(true);
    expect(matchesAccept('./id.png', '.pdf, .jpg')).toBe(false);
  });
  it('matches exact MIME types and wildcards from the extension table', () => {
    expect(matchesAccept('./id.pdf', 'application/pdf')).toBe(true);
    expect(matchesAccept('./photo.jpeg', 'image/*')).toBe(true);
    expect(matchesAccept('./id.pdf', 'image/*')).toBe(false);
    expect(matchesAccept('./sheet.xlsx', 'application/vnd.ms-excel,.xlsx')).toBe(true);
  });
  it('only matches unknown extensions through explicit extension tokens', () => {
    expect(matchesAccept('./scan.heic', 'image/*')).toBe(false);
    expect(matchesAccept('./scan.heic', 'image/*,.heic')).toBe(true);
  });
});
