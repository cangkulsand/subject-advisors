import { useEffect, useRef, useState, type AnimationEvent } from 'react';
import type { ToastKind, ToastNotification } from './ToastStack';

const toastDuration = 5000;
const toastExitDuration = 300;
const maxVisibleToasts = 3;

export function useToastNotifications() {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const toastsRef = useRef<ToastNotification[]>([]);
  const nextToastId = useRef(1);
  const toastTimers = useRef(new Map<number, { auto: number | null; exit: number | null }>());
  const mounted = useRef(false);

  function updateToasts(updater: (current: ToastNotification[]) => ToastNotification[]) {
    const next = updater(toastsRef.current);
    toastsRef.current = next;
    setToasts(next);
  }

  function clearToastTimers(id: number) {
    const timers = toastTimers.current.get(id);
    if (timers?.auto !== null && timers?.auto !== undefined) window.clearTimeout(timers.auto);
    if (timers?.exit !== null && timers?.exit !== undefined) window.clearTimeout(timers.exit);
    toastTimers.current.delete(id);
  }

  function removeToast(id: number) {
    if (!mounted.current) return;
    clearToastTimers(id);
    updateToasts(current => current.filter(toast => toast.id !== id));
  }

  function dismissToast(id: number) {
    if (!mounted.current) return;
    const toast = toastsRef.current.find(item => item.id === id);
    if (!toast || toast.closing) return;
    const timers = toastTimers.current.get(id);
    if (timers?.auto !== null && timers?.auto !== undefined) window.clearTimeout(timers.auto);
    const exit = window.setTimeout(() => removeToast(id), toastExitDuration);
    toastTimers.current.set(id, { auto: null, exit });
    updateToasts(current => current.map(item => item.id === id ? { ...item, closing: true } : item));
  }

  function notify(message: string, kind: ToastKind = 'success') {
    if (!mounted.current) return;
    const id = nextToastId.current++;
    const item: ToastNotification = { id, message, kind, closing: false };
    const current = toastsRef.current;
    const next = [...current, item].slice(-maxVisibleToasts);
    const retained = new Set(next.map(toast => toast.id));
    for (const old of current) if (!retained.has(old.id)) clearToastTimers(old.id);
    updateToasts(() => next);
    const auto = window.setTimeout(() => dismissToast(id), toastDuration - toastExitDuration);
    toastTimers.current.set(id, { auto, exit: null });
  }

  function onToastAnimationEnd(id: number, event: AnimationEvent<HTMLDivElement>) {
    if (event.animationName === 'p001-toast-exit') removeToast(id);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const timers of toastTimers.current.values()) {
        if (timers.auto !== null) window.clearTimeout(timers.auto);
        if (timers.exit !== null) window.clearTimeout(timers.exit);
      }
      toastTimers.current.clear();
    };
  }, []);

  return { toasts, notify, dismissToast, onToastAnimationEnd };
}
