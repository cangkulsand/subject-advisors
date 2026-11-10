export type SelectionPhase = 'PLANNING' | 'OPEN' | 'CLOSED';
export interface SelectionWindow { selectionOpensAt: string | null; selectionClosesAt: string | null }

/** PLANNING until the opening time (or without one), OPEN until the closing time, then CLOSED. */
export function selectionPhase(window: SelectionWindow, now: Date): SelectionPhase {
  const time = now.getTime();
  if (window.selectionOpensAt === null || time < Date.parse(window.selectionOpensAt)) return 'PLANNING';
  if (window.selectionClosesAt !== null && time >= Date.parse(window.selectionClosesAt)) return 'CLOSED';
  return 'OPEN';
}
