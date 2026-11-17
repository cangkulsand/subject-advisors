import { useEffect, useRef, type RefObject } from 'react';
import Sortable from 'sortablejs';

export interface SortableHandlers {
  /** A card was dropped on another semester. The DOM is already put back; React decides what changes. */
  onMove: (subjectId: number, toKey: string) => void;
  onStart?: (subjectId: number) => void;
  onEnd?: () => void;
}

/**
 * SortableJS on every `.planning-cards` list inside `container` (S3-P004-010). React stays the only owner of the DOM:
 * when SortableJS moves a card to another list, the card is put straight back where it came from before `onMove` runs.
 * Pointer-based dragging (`forceFallback`) behaves the same with a mouse, a pen and touch.
 */
export function useSortableLists(container: RefObject<HTMLElement | null>, enabled: boolean, handlers: SortableHandlers, deps: unknown[]): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const root = container.current;
    if (!enabled || !root) return;
    const instances = [...root.querySelectorAll<HTMLElement>('.planning-cards')].map(list => Sortable.create(list, {
      group: 'plan', sort: false, handle: '.planning-grip', filter: '.planning-locked', draggable: '.planning-subject-card',
      animation: 150, forceFallback: true, fallbackOnBody: true, fallbackTolerance: 3, delay: 150, delayOnTouchOnly: true,
      scroll: true, ghostClass: 'planning-card-ghost', chosenClass: 'planning-card-chosen',
      onStart: event => latest.current.onStart?.(Number(event.item.dataset.id)),
      onEnd: event => {
        const moved = event.from !== event.to;
        if (moved) event.from.insertBefore(event.item, event.from.children[event.oldIndex ?? 0] ?? null);
        latest.current.onEnd?.();
        if (moved && event.to.dataset.key) latest.current.onMove(Number(event.item.dataset.id), event.to.dataset.key);
      },
    }));
    return () => { for (const instance of instances) instance.destroy(); };
  }, [enabled, container, ...deps]);
}
