import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exitViewAs, readViewAs, startViewAs, viewAsHeaders, VIEW_AS_STORAGE_KEY } from './view-as';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('../../app/navigation', () => ({ navigateApp: navigate }));
const clear = vi.hoisted(() => vi.fn());
vi.mock('./account-cache', () => ({ clearAccountCache: clear }));

function makeStorage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear() { values.clear(); }, getItem: key => values.get(key) ?? null, key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); }, setItem: (key, value) => { values.set(key, value); } };
}
let store: Storage;
beforeEach(() => { store = makeStorage(); vi.stubGlobal('window', { sessionStorage: store }); navigate.mockReset(); clear.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

describe('view-as state (S3-P004-033)', () => {
  it('sends nothing when no view is active', () => {
    expect(readViewAs()).toBeNull();
    expect(viewAsHeaders()).toEqual({});
  });
  it('starts a coordinator view: stores it, clears the account cache and opens the coordinator workspace', () => {
    startViewAs({ role: 'COORDINATOR', programmeId: 5, learningCentreId: 2, label: 'SECJ, Johor Bahru' });
    expect(viewAsHeaders()).toEqual({ 'X-View-As': 'COORDINATOR;programme=5;centre=2' });
    expect(clear).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/coordinator', expect.anything());
  });
  it('starts a student view on the student workspace', () => {
    startViewAs({ role: 'STUDENT', studentId: 42, label: 'Aina' });
    expect(viewAsHeaders()).toEqual({ 'X-View-As': 'STUDENT;student=42' });
    expect(navigate).toHaveBeenCalledWith('/student', expect.anything());
  });
  it('exits: forgets the view, clears the account cache and returns to admin', () => {
    startViewAs({ role: 'STUDENT', studentId: 42, label: 'Aina' }); clear.mockReset();
    exitViewAs();
    expect(readViewAs()).toBeNull();
    expect(viewAsHeaders()).toEqual({});
    expect(clear).toHaveBeenCalled();
    expect(navigate).toHaveBeenLastCalledWith('/admin', expect.anything());
  });
  it.each(['{', '"x"', JSON.stringify({ role: 'ADMIN' }), JSON.stringify({ role: 'STUDENT', studentId: 0, label: 'x' }), JSON.stringify({ role: 'COORDINATOR', programmeId: 5, label: 'x' })])('ignores bad stored value %s', value => {
    store.setItem(VIEW_AS_STORAGE_KEY, value);
    expect(readViewAs()).toBeNull();
    expect(viewAsHeaders()).toEqual({});
  });
  it('works without storage (blocked or private mode)', () => {
    vi.stubGlobal('window', { get sessionStorage() { throw new Error('blocked'); } });
    expect(readViewAs()).toBeNull();
    expect(() => exitViewAs()).not.toThrow();
  });
});
