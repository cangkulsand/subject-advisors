import type { Me } from './contracts';
import { AuthApiError, loadAccount } from './client';
import { clearAcademicCache, keepAcademicSession } from '../profile/data-cache';

export interface AccountSession { userId: string; sessionId: string; apiBaseUrl?: string }
const prefix = 'subject-advisors.account.v3:';
const legacyPrefixes = ['subject-advisors.account.v1:', 'subject-advisors.account.v2:'];
function legacy(id: string) { return legacyPrefixes.some(value => id.startsWith(value)); }
export const ACCOUNT_CACHE_CHANGED = 'subject-advisors:account-cache-changed';
const memory = new Map<string, Me>();
const pending = new Map<string, Promise<Me>>();
let generation = 0;
let activeSession: string | undefined;
function key(session: AccountSession) { return prefix + JSON.stringify([session.userId, session.sessionId, (session.apiBaseUrl ?? '').replace(/\/+$/, '')]); }
function storage(): Storage | undefined { try { return typeof window === 'undefined' ? undefined : window.sessionStorage; } catch { return undefined; } }
function valid(value: unknown, userId: string): value is Me {
  if (!value || typeof value !== 'object') return false;
  const me = value as Me;
  if (me.clerkUserId !== userId || me.accessStatus !== 'ACTIVE') return false;
  const allowed = ['STUDENT','COORDINATOR','SYSTEM_ADMIN'];
  if (!Array.isArray(me.roles) || !me.roles.length || me.roles.some(role => !allowed.includes(role)) || new Set(me.roles).size !== me.roles.length ||
      !Array.isArray(me.availableRoles) || !me.availableRoles.length || me.availableRoles.some(role => !me.roles.includes(role)) ||
      new Set(me.availableRoles).size !== me.availableRoles.length || !me.availableRoles.includes(me.appRole) ||
      !['COMPLETE','SETUP_REQUIRED','UNAVAILABLE','NOT_APPLICABLE'].includes(me.studentProfileState) ||
      me.availableRoles.includes('STUDENT') === (me.studentProfileState === 'NOT_APPLICABLE')) return false;
  if (me.appRole === 'STUDENT') return ['COMPLETE','SETUP_REQUIRED','UNAVAILABLE'].includes(me.profileState) && me.profileState === me.studentProfileState && me.landingPath === (me.profileState === 'COMPLETE' ? '/student' : '/student/setup');
  return me.profileState === 'NOT_APPLICABLE' && (me.appRole === 'COORDINATOR' && me.landingPath === '/coordinator' || me.appRole === 'SYSTEM_ADMIN' && me.landingPath === '/admin');
}
function snapshot(me: Me): Me {
  return { clerkUserId: me.clerkUserId, appRole: me.appRole, roles: [...me.roles], availableRoles: [...me.availableRoles],
    studentProfileState: me.studentProfileState, accessStatus: me.accessStatus, profileState: me.profileState, landingPath: me.landingPath };
}
export function readAccountCache(session: AccountSession): Me | undefined {
  const id = key(session), cached = memory.get(id);
  if (cached) return cached;
  try { const value: unknown = JSON.parse(storage()?.getItem(id) ?? 'null'); if (valid(value,session.userId) && value.profileState !== 'UNAVAILABLE') { const me = snapshot(value); memory.set(id,me); return me; } } catch { /* malformed/blocked storage is not an authentication result */ }
  return undefined;
}
function write(session: AccountSession, me: Me) {
  if (!valid(me,session.userId)) throw new AuthApiError(503,'INVALID_ACCOUNT_RESPONSE','Account access could not be verified. Please retry.');
  if (me.profileState === 'UNAVAILABLE') { memory.delete(key(session)); try { storage()?.removeItem(key(session)); } catch { /* optional storage */ } return; }
  const value = snapshot(me); memory.set(key(session),value);
  try { storage()?.setItem(key(session),JSON.stringify(value)); } catch { /* memory cache remains usable */ }
}
function notify(kind = 'invalidated') { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ACCOUNT_CACHE_CHANGED,{detail:kind})); }
export function clearAccountCache(notifyListeners = true) {
  clearAcademicCache();
  generation++; memory.clear(); pending.clear();
  try { const store = storage(); if (store) for (let i=store.length-1;i>=0;i--) { const id=store.key(i); if(id?.startsWith(prefix)||id&&legacy(id))store.removeItem(id); } } catch { /* no credential is stored here */ }
  if (notifyListeners) notify();
}
/** Prune only other users/sessions; retain this session across document navigations. */
export function keepAccountSession(session: AccountSession | null) {
  if (!session) { activeSession=undefined; clearAccountCache(false); return; }
  const identity=JSON.stringify([session.userId,session.sessionId]);
  if(activeSession!==identity){keepAcademicSession(identity);if(activeSession!==undefined){generation++;pending.clear();}activeSession=identity;}
  const belongs = (id: string) => { try { const parts: unknown = JSON.parse(id.slice(prefix.length)); return Array.isArray(parts) && parts[0] === session.userId && parts[1] === session.sessionId; } catch { return false; } };
  for (const id of memory.keys()) if (!belongs(id)) memory.delete(id);
  try { const store=storage(); if(store)for(let i=store.length-1;i>=0;i--){const id=store.key(i);if(id&&legacy(id) || id?.startsWith(prefix)&&!belongs(id))store.removeItem(id);} } catch { /* storage may be disabled */ }
}
export function loadSessionAccount(session: AccountSession, getToken: () => Promise<string | null>, initialize = false, force = false): Promise<Me> {
  if (!initialize && !force) { const cached=readAccountCache(session); if(cached)return Promise.resolve(cached); }
  const id=key(session)+(initialize?':initialize':':read');
  const existing=pending.get(id); if(existing)return existing;
  const version=generation;
  const result=loadAccount(getToken,session.apiBaseUrl,initialize).then(me=>{
    if(version===generation)write(session,me);
    return me;
  }).catch(error=>{ if(version===generation)clearAccountCache(false); throw error; })
    .finally(()=>{if(pending.get(id)===result)pending.delete(id);});
  pending.set(id,result);return result;
}
export async function refreshAccountRoles(session: AccountSession, getToken: () => Promise<string | null>): Promise<Me> {
  const stamp = accountSessionStamp();
  const version = generation;
  if (stamp !== JSON.stringify([session.userId,session.sessionId])) throw new AuthApiError(401,'SESSION_CHANGED','Your account changed. Please sign in again.');
  const me = await loadSessionAccount(session, getToken, false, true);
  if (version !== generation || stamp !== accountSessionStamp() || me.clerkUserId !== session.userId) throw new AuthApiError(401,'SESSION_CHANGED','Your account access changed. Please retry.');
  notify('access-refreshed');
  return me;
}
/** A successful validated profile PUT completes setup without another navigation check. */
export function accountSessionStamp() { return activeSession; }
export function profileSavedForSession(apiBaseUrl = '', expectedSession = activeSession) {
  if (!expectedSession || expectedSession !== activeSession) return;
  generation++; pending.clear();
  const store=storage();
  try { if(store)for(let i=0;i<store.length;i++){const id=store.key(i);if(id?.startsWith(prefix)&&!memory.has(id)){const me:unknown=JSON.parse(store.getItem(id)??'null');const parts:unknown=JSON.parse(id.slice(prefix.length));if(Array.isArray(parts)&&valid(me,String(parts[0])))memory.set(id,snapshot(me));}} } catch { /* use known in-memory entries */ }
  for(const [id,me]of memory){const parts:unknown=JSON.parse(id.slice(prefix.length));if(Array.isArray(parts)&&JSON.stringify(parts.slice(0,2))===expectedSession&&parts[2]===apiBaseUrl.replace(/\/+$/,'')&&me.availableRoles.includes('STUDENT')){const updated:Me={...me,studentProfileState:'COMPLETE',...(me.appRole==='STUDENT'?{profileState:'COMPLETE',landingPath:'/student'}:{})};memory.set(id,updated);try{store?.setItem(id,JSON.stringify(updated));}catch{/* optional storage */}}}
  notify('profile-saved');
}
