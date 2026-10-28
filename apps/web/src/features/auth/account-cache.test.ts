import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { accountSessionStamp,clearAccountCache,keepAccountSession,loadSessionAccount,profileSavedForSession,readAccountCache } from './account-cache';
import type { Me } from './contracts';
const session={userId:'user_test',sessionId:'session_a'};
const me:Me={clerkUserId:'user_test',appRole:'STUDENT',accessStatus:'ACTIVE',profileState:'COMPLETE',landingPath:'/student'};
let store: Storage;
function makeStorage(): Storage {
  const values=new Map<string,string>();
  return {get length(){return values.size;},clear(){values.clear();},getItem:key=>values.get(key)??null,key:index=>[...values.keys()][index]??null,removeItem:key=>{values.delete(key);},setItem:(key,value)=>{values.set(key,value);}};
}
beforeEach(()=>{store=makeStorage();vi.stubGlobal('window',{sessionStorage:store,dispatchEvent:vi.fn()});keepAccountSession(null);keepAccountSession(session);});
afterEach(()=>{keepAccountSession(null);vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});
function respond(value:Me=me){const fetcher=vi.fn<(path:string,init?:RequestInit)=>Promise<Response>>(async()=>Response.json({data:value}));vi.stubGlobal('fetch',fetcher);return fetcher;}
it('reuses account access for the same session without fetching or minting another token',async()=>{
 const fetcher=respond(),token=vi.fn(async()=>'TEST_TOKEN');await loadSessionAccount(session,token);await loadSessionAccount(session,token);expect(fetcher).toHaveBeenCalledTimes(1);expect(token).toHaveBeenCalledTimes(1);
});
it('does not poll or expire the snapshot while the same Clerk session remains active',async()=>{
 const fetcher=respond();await loadSessionAccount(session,async()=>'TEST_TOKEN');vi.useFakeTimers();vi.advanceTimersByTime(24*60*60*1000);await loadSessionAccount(session,async()=>'TEST_TOKEN');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('deduplicates simultaneous gate requests including StrictMode remounts',async()=>{
 const fetcher=respond();const first=loadSessionAccount(session,async()=>'TEST_TOKEN'),second=loadSessionAccount(session,async()=>'TEST_TOKEN');expect(first).toBe(second);await Promise.all([first,second]);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('persists only minimal account state across document navigation without a token',async()=>{
 respond();await loadSessionAccount(session,async()=>'SECRET_TEST_TOKEN');expect(store.length).toBe(1);const saved=store.getItem(store.key(0)!);expect(saved).not.toContain('SECRET_TEST_TOKEN');expect(JSON.parse(saved!)).toEqual(me);
});
it('ignores legacy COMPLETE snapshots after current-semester setup becomes required',async()=>{
 const id='subject-advisors.account.v1:'+JSON.stringify(['user_test','session_a','']);store.setItem(id,JSON.stringify(me));const setup:Me={...me,profileState:'SETUP_REQUIRED',landingPath:'/student/setup'};const fetcher=respond(setup);expect(await loadSessionAccount(session,async()=>'TEST_TOKEN')).toEqual(setup);expect(fetcher).toHaveBeenCalledOnce();
});
it('reads the new-version tab snapshot without making another request',async()=>{
 const id='subject-advisors.account.v2:'+JSON.stringify(['user_test','session_a','']);store.setItem(id,JSON.stringify(me));const fetcher=respond();expect(await loadSessionAccount(session,async()=>'TEST_TOKEN')).toEqual(me);expect(fetcher).not.toHaveBeenCalled();
});
it.each([{...session,sessionId:'different_session'},{...session,userId:'different_user'},{...session,apiBaseUrl:'https://different-api.test'}])('isolates the cache from %j',async other=>{
 respond();await loadSessionAccount(session,async()=>'TEST_TOKEN');expect(readAccountCache(other)).toBeUndefined();
});
it('forces fresh initialization at login even when a snapshot is cached',async()=>{
 const fetcher=respond();await loadSessionAccount(session,async()=>'TEST_TOKEN');await loadSessionAccount(session,async()=>'TEST_TOKEN',true);expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[1]?.[0]).toBe('/api/me/initialize');
});
it('an explicit retry bypasses the snapshot',async()=>{
 const fetcher=respond();await loadSessionAccount(session,async()=>'TEST_TOKEN');await loadSessionAccount(session,async()=>'TEST_TOKEN',false,true);expect(fetcher).toHaveBeenCalledTimes(2);
});
it('clears snapshots on logout and prunes old user/session storage',async()=>{
 respond();await loadSessionAccount(session,async()=>'TEST_TOKEN');keepAccountSession({...session,sessionId:'session_b'});expect(readAccountCache(session)).toBeUndefined();expect(store.length).toBe(0);keepAccountSession(null);expect(accountSessionStamp()).toBeUndefined();
});
it('does not cache denials or reuse an earlier success after a denial',async()=>{
 respond();await loadSessionAccount(session,async()=>'TEST_TOKEN');vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{code:'ACCESS_SUSPENDED',message:'Denied'}},{status:403})));await expect(loadSessionAccount(session,async()=>'TEST_TOKEN',false,true)).rejects.toMatchObject({status:403});expect(readAccountCache(session)).toBeUndefined();
});
it('rejects malformed, foreign-user and arbitrary redirect snapshots',async()=>{
 const id='subject-advisors.account.v2:'+JSON.stringify(['user_test','session_a','']);for(const data of ['{',JSON.stringify({...me,clerkUserId:'other'}),JSON.stringify({...me,landingPath:'https://outside.test'})]){store.setItem(id,data);expect(readAccountCache(session)).toBeUndefined();}
});
it('uses memory when browser storage is disabled',async()=>{
 vi.stubGlobal('window',{get sessionStorage(){throw new Error('blocked');},dispatchEvent:vi.fn()});const fetcher=respond();await loadSessionAccount(session,async()=>'TEST_TOKEN');await loadSessionAccount(session,async()=>'TEST_TOKEN');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('prevents a response arriving after logout from recreating a snapshot',async()=>{
 let finish!:(value:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;})));const pending=loadSessionAccount(session,async()=>'TEST_TOKEN');await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));clearAccountCache(false);finish(Response.json({data:me}));await pending;expect(readAccountCache(session)).toBeUndefined();
});
it('updates setup after profile save without an extra account check on navigation',async()=>{
 const fetcher=respond({...me,profileState:'SETUP_REQUIRED',landingPath:'/student/setup'});await loadSessionAccount(session,async()=>'TEST_TOKEN');profileSavedForSession();expect((await loadSessionAccount(session,async()=>'TEST_TOKEN')).profileState).toBe('COMPLETE');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('ignores an old profile-save result after switching sessions',async()=>{
 respond({...me,profileState:'SETUP_REQUIRED',landingPath:'/student/setup'});await loadSessionAccount(session,async()=>'TEST_TOKEN');const stamp=accountSessionStamp();keepAccountSession({...session,sessionId:'session_b'});await loadSessionAccount({...session,sessionId:'session_b'},async()=>'TEST_TOKEN');profileSavedForSession('',stamp);expect(readAccountCache({...session,sessionId:'session_b'})?.profileState).toBe('SETUP_REQUIRED');
});
