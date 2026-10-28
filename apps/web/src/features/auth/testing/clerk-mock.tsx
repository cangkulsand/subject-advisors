// TEST ONLY. This module is never exported by the production auth entry point.
import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
const scenario = new URLSearchParams(window.location.search).get('scenario');
const testParams = new URLSearchParams(window.location.search);
const getToken = async () => scenario === 'expired-token' ? null : scenario === 'token-pending' ? await new Promise<never>(() => undefined) : 'test-only-token';
const LoadedContext=createContext(true);
export const useAuth = () => ({
  isLoaded: useContext(LoadedContext) && scenario !== 'loading', isSignedIn: scenario !== 'signed-out',
  userId: testParams.get('test-user') ?? 'user_test', sessionId: testParams.get('test-session') ?? 'sess_test', getToken,
});
export const useClerk = () => ({
  signOut: async () => {
    if (scenario === 'logout-failure') throw new Error('test-only failure');
    document.body.dataset.signedOut = 'true';
  },
});
export function ClerkProvider({ children }: { children: ReactNode }) {
  const [loaded,setLoaded]=useState(scenario!=='sdk-boot');
  useEffect(()=>{document.documentElement.dataset.clerkMounts=String(Number(document.documentElement.dataset.clerkMounts??0)+1);const timer=setTimeout(()=>setLoaded(true),30);return()=>clearTimeout(timer);},[]);
  return <LoadedContext.Provider value={loaded}>{children}</LoadedContext.Provider>;
}
export function SignIn() { return <p>Test sign-in widget</p>; }
export function SignUp() { return <p>Test sign-up widget</p>; }
