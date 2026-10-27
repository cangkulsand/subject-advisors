import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OfferingsPage } from '../../../apps/web/src/features/offerings';
import { createDemoClient } from './client';
import './prototype.css';

function Prototype() {
  const [demo] = useState(createDemoClient);
  const [revision, setRevision] = useState(0);
  const [toolNotice, setToolNotice] = useState('');
  return <>
    <a className="prototype-skip" href="#prototype-main">Skip to semester offerings</a>
    <div className="prototype-banner"><strong>INTERACTIVE PROTOTYPE</strong><span>Fictional data · Saved only in this browser · No university connection</span></div>
    <header className="prototype-header"><div className="prototype-brand"><span className="prototype-mark" aria-hidden="true">AJ</span>
      <div><strong>Academic Journey</strong><span>Plan with a clearer picture.</span></div></div>
      <div className="prototype-scope"><span>Programmer 2</span><strong>Semester offerings</strong></div></header>
    <main id="prototype-main"><OfferingsPage key={revision} client={demo.api} demonstration /></main>
    <footer className="prototype-footer"><div><strong>Built for the next sprint conversation.</strong><p>UC08 · Select, review and save student-reported offerings.</p></div>
      <details className="prototype-tools"><summary>Prototype tools</summary><p>These tools use fictional browser data. Reload and reset discard the current draft.</p>
        <div><button type="button" onClick={() => { demo.failNextSave(); setToolNotice('The next save will fail once. Your previous saved list will be kept.'); }}>Fail next save</button>
          <button type="button" onClick={() => { demo.failNextLoad(); setRevision(value => value + 1); setToolNotice('Loading failure simulated. Use Retry loading to recover.'); }}>Simulate loading error</button>
          <button type="button" onClick={() => {
            try { demo.reset(); setRevision(value => value + 1); setToolNotice('Demo data reset.'); }
            catch { setToolNotice('Browser storage is blocked. Allow storage to reset the demo.'); }
          }}>Reset demo data</button></div>
        {toolNotice && <p role="status">{toolNotice}</p>}
      </details></footer>
  </>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Prototype /></StrictMode>);
