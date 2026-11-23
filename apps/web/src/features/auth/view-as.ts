import { navigateApp } from '../../app/navigation';
import { clearAccountCache } from './account-cache';
import { VIEW_AS_STORAGE_KEY, type WebViewAs } from './view-as-header';

export { readViewAs, viewAsHeaders, viewAsValue, VIEW_AS_STORAGE_KEY, type WebViewAs } from './view-as-header';
function storage(): Storage | undefined { try { return typeof window === 'undefined' ? undefined : window.sessionStorage; } catch { return undefined; } }

export function startViewAs(view: WebViewAs): void {
  try { storage()?.setItem(VIEW_AS_STORAGE_KEY, JSON.stringify(view)); } catch { /* without storage the view cannot start */ }
  clearAccountCache();
  navigateApp(view.role === 'COORDINATOR' ? '/coordinator' : '/student', { skipUnsaved: true });
}
export function exitViewAs(): void {
  try { storage()?.removeItem(VIEW_AS_STORAGE_KEY); } catch { /* nothing stored */ }
  clearAccountCache();
  navigateApp('/admin', { skipUnsaved: true });
}
