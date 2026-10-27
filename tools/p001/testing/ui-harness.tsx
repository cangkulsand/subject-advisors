// TEST ONLY: explicitly mocked Clerk and API. Never imported by the runnable preview.
import { createRoot } from 'react-dom/client';
import { AuthGate } from '../../../apps/web/src/features/auth';
import { ProfilePage } from '../../../apps/web/src/features/profile/ProfilePage';
import { RecordsPage } from '../../../apps/web/src/features/records/RecordsPage';
import { createAcademicClient } from '../../../apps/web/src/features/profile/client';
const api = createAcademicClient(async () => 'TEST_ONLY_TOKEN');
const path = window.location.pathname;
const query = new URLSearchParams(window.location.search);
const records = path === '/student/records' || query.get('view') === 'records';
createRoot(document.getElementById('root')!).render(<>
  <p>DEMO / NOT OFFICIAL — mocked browser test</p>
  {path === '/sign-in' ? <h1>Test sign-in destination</h1> : <AuthGate roles={['STUDENT']} requireProfile={records}>
    {records ? <RecordsPage api={api} /> : <ProfilePage api={api} setup={path === '/student/setup'} onSetupComplete={() => window.location.assign('/student/records')} />}
  </AuthGate>}
</>);
