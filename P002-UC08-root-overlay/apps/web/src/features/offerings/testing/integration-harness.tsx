/** Browser-test entry only. Production imports StudentOfferingsRoute directly. */
import { createRoot } from 'react-dom/client';
import { StudentOfferingsRoute } from '../StudentOfferingsRoute';
createRoot(document.getElementById('root')!).render(<>
  <StudentOfferingsRoute />
  <button type="button" onClick={() => window.dispatchEvent(new Event('p002-test-session'))}>Switch test student</button>
</>);
