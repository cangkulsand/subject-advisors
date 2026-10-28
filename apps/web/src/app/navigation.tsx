import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

const indexKey = '__subjectAdvisorsRouteIndex';
let currentPath = typeof window === 'undefined' ? '/' : window.location.pathname;
let currentUrl = typeof window === 'undefined' ? '/' : window.location.href;
let currentIndex = 0;
let restoringHistory = false;
const listeners = new Set<() => void>();
const unsavedChecks = new Set<() => boolean>();
function emit() { for (const listener of listeners) listener(); }
function mayLeave() { return ![...unsavedChecks].some(check => check()) || window.confirm('Discard unsaved changes and leave this page?'); }
function acceptLocation() {
  currentPath=window.location.pathname; currentUrl=window.location.href;
  const index: unknown=window.history.state?.[indexKey];
  if(typeof index==='number')currentIndex=index;
  emit();
}
function onPopState(event: PopStateEvent) {
  if(restoringHistory){restoringHistory=false;return;}
  const target: unknown=event.state?.[indexKey];
  if(!mayLeave()){
    if(typeof target==='number'&&target!==currentIndex){restoringHistory=true;window.history.go(currentIndex-target);}
    else window.history.replaceState({[indexKey]:currentIndex},'',currentUrl);
    return;
  }
  acceptLocation();
}
function subscribe(listener: () => void) {
  if(!listeners.size){
    currentPath=window.location.pathname;currentUrl=window.location.href;
    const index: unknown=window.history.state?.[indexKey];currentIndex=typeof index==='number'?index:0;
    if(typeof index!=='number')window.history.replaceState({...window.history.state,[indexKey]:currentIndex},'',window.location.href);
    window.addEventListener('popstate',onPopState);
  }
  listeners.add(listener);
  return ()=>{listeners.delete(listener);if(!listeners.size)window.removeEventListener('popstate',onPopState);};
}
export function useAppPathname() { return useSyncExternalStore(subscribe,()=>currentPath,()=>'/'); }
/** Includes query changes for screens with URL-initialized filters. */
export function useAppLocation() { return useSyncExternalStore(subscribe,()=>currentUrl,()=>'/'); }
export function registerUnsavedChanges(check: () => boolean) { unsavedChecks.add(check); return ()=>{unsavedChecks.delete(check);}; }

/** Standalone feature consumers retain normal navigation when this router is absent. */
export function navigateApp(to: string, options: { replace?: boolean; skipUnsaved?: boolean } = {}): boolean {
  const target=new URL(to,window.location.href);
  if(!listeners.size || target.origin!==window.location.origin){
    if(options.replace)window.location.replace(target.href);else window.location.assign(target.href);
    return true;
  }
  if(target.href===window.location.href)return true;
  if(!options.skipUnsaved&&!mayLeave())return false;
  currentIndex=options.replace?currentIndex:currentIndex+1;
  if(options.replace)window.history.replaceState({[indexKey]:currentIndex},'',target.href);
  else window.history.pushState({[indexKey]:currentIndex},'',target.href);
  acceptLocation();window.scrollTo(0,0);return true;
}
export function AppLink({ onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  function click(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||props.download!==undefined||props.target&&props.target!=='_self'||!props.href)return;
    const destination=new URL(props.href,window.location.href);
    if(destination.origin!==window.location.origin)return;
    event.preventDefault();navigateApp(destination.href);
  }
  return <a {...props} onClick={click} />;
}
