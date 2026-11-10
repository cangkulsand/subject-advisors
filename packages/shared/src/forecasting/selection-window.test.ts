import { describe, expect, it } from 'vitest';
import { selectionPhase } from './selection-window';

const t = (s: string) => new Date(s);
describe('selectionPhase', () => {
  it('is PLANNING without dates or before opening', () => {
    expect(selectionPhase({ selectionOpensAt: null, selectionClosesAt: null }, t('2026-11-10T00:00:00Z'))).toBe('PLANNING');
    expect(selectionPhase({ selectionOpensAt: '2026-11-20T00:00:00Z', selectionClosesAt: null }, t('2026-11-19T23:59:59Z'))).toBe('PLANNING');
  });
  it('is OPEN from the opening time until the closing time', () => {
    expect(selectionPhase({ selectionOpensAt: '2026-11-20T00:00:00Z', selectionClosesAt: '2026-12-01T00:00:00Z' }, t('2026-11-20T00:00:00Z'))).toBe('OPEN');
    expect(selectionPhase({ selectionOpensAt: '2026-11-20T00:00:00Z', selectionClosesAt: null }, t('2027-01-01T00:00:00Z'))).toBe('OPEN');
  });
  it('is CLOSED from the closing time', () => {
    expect(selectionPhase({ selectionOpensAt: '2026-11-20T00:00:00Z', selectionClosesAt: '2026-12-01T00:00:00Z' }, t('2026-12-01T00:00:00Z'))).toBe('CLOSED');
  });
});
