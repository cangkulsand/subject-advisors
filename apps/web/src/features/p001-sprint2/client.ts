import { AcademicApiError } from '../profile/client';
export type Sprint2Client = <T>(path: string, options?: { method?: 'GET'|'POST'|'PUT'|'DELETE'; body?: unknown; signal?: AbortSignal }) => Promise<T>;
export function createSprint2Client(getToken: () => Promise<string|null>): Sprint2Client {
  return async <T>(path: string,options: Parameters<Sprint2Client>[1]={}): Promise<T> => {
    const token=await getToken();
    if (!token) throw new AcademicApiError(401,'SESSION_REQUIRED','Sign in again to continue.');
    const response=await fetch('/api/p001-sprint2'+path,{method:options.method??'GET',signal:options.signal,
      headers:{Authorization:'Bearer '+token,...(options.body===undefined?{}:{'Content-Type':'application/json'})},
      body:options.body===undefined?undefined:JSON.stringify(options.body),credentials:'omit',cache:'no-store'});
    const value=await response.json();
    if (response.ok && value && 'data' in value) return value.data as T;
    throw new AcademicApiError(response.status,value?.error?.code??'INVALID_RESPONSE',value?.error?.message??'The operation could not be confirmed. Please retry.');
  };
}
