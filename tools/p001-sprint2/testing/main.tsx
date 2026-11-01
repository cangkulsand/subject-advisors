// Test-only entry; Clerk and HTTP APIs are explicitly mocked by test-ui.mjs.
import { createRoot } from 'react-dom/client';
import { Sprint2Routes,type Sprint2Area } from '../../../apps/web/src/features/p001-sprint2/Sprint2Routes';
const path=window.location.pathname;
const area:Sprint2Area=path.startsWith('/admin')?'curriculum':path==='/student/setup'?'setup':'progress';
document.body.classList.add('s2-preview');
createRoot(document.getElementById('root')!).render(<><p style={{padding:'0 1rem'}}>DEMO / NOT OFFICIAL — simulated account and API</p><Sprint2Routes area={area}/></>);
