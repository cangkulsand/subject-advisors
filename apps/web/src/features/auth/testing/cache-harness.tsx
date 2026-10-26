// TEST ONLY. Mocked Clerk is supplied by the browser-test bundler, never the app.
import { createRoot } from 'react-dom/client';
import { AuthGate,AuthProvider,LogoutButton } from '../Auth';
import { createAcademicClient } from '../../profile/client';
import { useState } from 'react';
const api=createAcademicClient(async()=>'TEST_ONLY_TOKEN');
function Page(){
  const [message,setMessage]=useState('');
  return <main><h1>Private academic page</h1><nav><a href="/student/profile">Profile</a><a href="/student/records">Records</a><a href="/student/offerings">Offerings</a></nav>
    <label>Draft<input /></label>
    <button type="button" onClick={()=>{void api('/api/profile',{method:'PUT',body:{studentName:'DEMO',curriculumId:1,weeklyWorkingHours:0,availableStudyHours:8}}).then(()=>setMessage('Profile saved'),()=>setMessage('Save denied'));}}>Save profile</button>
    <p role="status">{message}</p><LogoutButton /></main>;
}
const path=window.location.pathname;
createRoot(document.getElementById('root')!).render(<AuthProvider publishableKey="TEST_ONLY_PUBLIC_KEY">{path==='/sign-in'?<h1>Test sign-in destination</h1>:<AuthGate roles={['STUDENT']} complete={path==='/auth/complete'}><Page /></AuthGate>}</AuthProvider>);
