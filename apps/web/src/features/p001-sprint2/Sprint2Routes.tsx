import { useMemo } from 'react';
import { useAuth } from '@clerk/react';
import { AuthGate,LogoutButton } from '../auth';
import { ProfilePage } from '../profile/ProfilePage';
import { RecordsPage } from '../records/RecordsPage';
import { createAcademicClient } from '../profile/client';
import { createSprint2Client } from './client';
import { ProgressPage } from './ProgressPage';
import { CurriculumPage } from './CurriculumPage';
export type Sprint2Area='progress'|'curriculum'|'profile'|'setup'|'records';
function Content({area}:{area:Sprint2Area}) {
  const {getToken,userId,sessionId}=useAuth();
  const api=useMemo(()=>createSprint2Client(getToken),[getToken]),academic=useMemo(()=>createAcademicClient(getToken),[getToken]);
  const admin=area==='curriculum';
  return <div key={[userId,sessionId].join('|')}><nav className="s2-preview-nav" aria-label={admin?'Curriculum navigation':'Student navigation'}>
    <span className="s2-title">Subject Advisors</span>
    {admin?<a href="/admin/curriculum" aria-current="page">Curriculum management</a>:<>
      <a href="/student/profile" aria-current={area==='profile'||area==='setup'?'page':undefined}>Academic profile</a>
      <a href="/student/records" aria-current={area==='records'?'page':undefined}>Subject records</a>
      <a href="/student/progress" aria-current={area==='progress'?'page':undefined}>Academic progress</a>
    </>}<LogoutButton/></nav><main>
      {area==='progress'?<ProgressPage api={api}/>:area==='curriculum'?<CurriculumPage api={api}/>:area==='records'?<RecordsPage api={academic}/>:<ProfilePage api={academic} setup={area==='setup'}/>}
    </main></div>;
}
export function Sprint2Routes({area}:{area:Sprint2Area}) {
  return <AuthGate roles={area==='curriculum'?['SYSTEM_ADMIN']:['STUDENT']} requireProfile={area==='progress'||area==='records'}><Content area={area}/></AuthGate>;
}
