import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import './forecasting-preview.css';

const CSV_HEADER = 'external_reference,curriculum_version,cohort_status,history_completeness,subject_code,subject_status,record_semester_id,recognized_credits,is_synthetic';
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const programmes = [
  { value: 'demo-computing', label: 'Applied Computing (demo)' },
  { value: 'demo-business', label: 'Business Analytics (demo)' },
];
const centres = [
  { value: 'demo-central', label: 'Central Centre (demo)' },
  { value: 'demo-coastal', label: 'Coastal Centre (demo)' },
];
const semesters = [
  { value: 'demo-2099-1', label: '2099/2100 - Semester 1' },
  { value: 'demo-2099-2', label: '2099/2100 - Semester 2' },
];

const sampleRows = [
  { code: 'DEMO101', name: 'Systems', eligible: 11, uncertain: 3, sections: '1 sample section', status: 'PRELIMINARY' },
  { code: 'DEMO204', name: 'Data Design', eligible: 5, uncertain: 7, sections: 'Not estimated', status: 'INSUFFICIENT DATA' },
  { code: 'DEMO305', name: 'Network Topics', eligible: 9, uncertain: 1, sections: '1 sample section', status: 'PRELIMINARY' },
];
const sampleExclusions = [
  { code: 'DEMO-FYP-A', reason: 'Excluded by the curriculum rules shown in this preview.' },
  { code: 'DEMO-PLACEMENT-A', reason: 'Excluded by the curriculum rules shown in this preview.' },
];

type Props = { title?: string };

export function ForecastingPreview({ title = 'Class Offering Forecast' }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const programmeField = useRef<HTMLSelectElement>(null);
  const [programme, setProgramme] = useState('');
  const [centre, setCentre] = useState('');
  const [semester, setSemester] = useState('');
  const [sourceDate, setSourceDate] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [formError, setFormError] = useState('');
  const [demoLoaded, setDemoLoaded] = useState(false);

  const clearDemo = () => setDemoLoaded(false);
  const chooseFile = (candidate: File | undefined) => {
    if (!candidate) return;
    clearDemo();
    setFile(null);
    setFileError('');
    setFormError('');
    if (!candidate.name.toLocaleLowerCase().endsWith('.csv')) {
      setFileError('Choose a file with a .csv extension. This preview does not read or parse it.');
      if (fileInput.current) fileInput.current.value = '';
    } else if (candidate.size > MAX_FILE_SIZE) {
      setFileError('Choose a CSV file no larger than 5 MiB. This preview does not read or parse it.');
      if (fileInput.current) fileInput.current.value = '';
    } else {
      setFile(candidate);
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => chooseFile(event.currentTarget.files?.[0]);
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (fileInput.current) fileInput.current.value = '';
    if (event.dataTransfer.files.length > 1) {
      clearDemo(); setFile(null); setFileError('Choose one CSV file at a time. This preview does not read or parse files.');
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    chooseFile(event.dataTransfer.files?.[0]);
  };

  const loadDemo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const missing = !programme || !centre || !semester || !sourceDate || !sourceLabel.trim();
    if (missing) {
      setFormError('Choose a degree, centre and target semester, then enter the source date and label to load the demo.');
      const firstMissing = !programme ? programmeField.current : document.getElementById(!centre ? 'uc20-centre' : !semester ? 'uc20-semester' : !sourceDate ? 'uc20-source-date' : 'uc20-source-label');
      firstMissing?.focus();
      return;
    }
    setFormError('');
    setFileError('');
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
    setDemoLoaded(true);
  };

  const removeFile = () => {
    setFile(null);
    setFileError('');
    if (fileInput.current) fileInput.current.value = '';
  };

  const reset = () => {
    setProgramme('');
    setCentre('');
    setSemester('');
    setSourceDate('');
    setSourceLabel('');
    setFile(null);
    setFileError('');
    setFormError('');
    setDemoLoaded(false);
    if (fileInput.current) fileInput.current.value = '';
  };

  const updateScope = (update: () => void) => {
    update();
    clearDemo();
    setFormError('');
  };

  return <div className="uc20-preview">
    <header className="uc20-heading">
      <div>
        <p className="uc20-eyebrow">COORDINATOR WORKSPACE</p>
        <h1>{title}</h1>
        <p>Choose a degree and centre, add source details, then explore the forecast workflow.</p>
      </div>
      <span className="uc20-preview-badge">Local preview</span>
    </header>

    <p className="uc20-demo-notice" role="note">
      <strong>Demo only.</strong> A selected CSV stays local and is not parsed or sent. Results appear only after loading the demo sample.
    </p>

    <form className="uc20-form" noValidate onSubmit={loadDemo}>
      <section className="uc20-card" aria-labelledby="uc20-scope-heading">
        <div className="uc20-section-heading">
          <span className="uc20-step" aria-hidden="true">1</span>
          <div><h2 id="uc20-scope-heading">Choose forecast scope</h2><p>Choose a programme, centre and target semester.</p></div>
        </div>
        <div className="uc20-field-grid">
          <label htmlFor="uc20-programme">Degree / programme
            <select id="uc20-programme" required aria-required="true" aria-invalid={!!formError && !programme} aria-describedby={formError && !programme ? 'uc20-form-error' : undefined} ref={programmeField} value={programme} onChange={event => updateScope(() => setProgramme(event.currentTarget.value))}>
              <option value="">Select a programme</option>
              {programmes.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label htmlFor="uc20-centre">Centre
            <select id="uc20-centre" required aria-required="true" aria-invalid={!!formError && !centre} aria-describedby={formError && !centre ? 'uc20-form-error' : undefined} value={centre} onChange={event => updateScope(() => setCentre(event.currentTarget.value))}>
              <option value="">Select a centre</option>
              {centres.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label htmlFor="uc20-semester">Target semester
            <select id="uc20-semester" required aria-required="true" aria-invalid={!!formError && !semester} aria-describedby={formError && !semester ? 'uc20-form-error' : undefined} value={semester} onChange={event => updateScope(() => setSemester(event.currentTarget.value))}>
              <option value="">Select a semester</option>
              {semesters.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="uc20-card" aria-labelledby="uc20-import-heading">
        <div className="uc20-section-heading">
          <span className="uc20-step" aria-hidden="true">2</span>
          <div><h2 id="uc20-import-heading">Add source details</h2><p>Attach one CSV for a local filename preview. Nothing is uploaded.</p></div>
        </div>
        <div className="uc20-field-grid uc20-meta-grid">
          <label htmlFor="uc20-source-date">Source date
            <input id="uc20-source-date" required aria-required="true" aria-invalid={!!formError && !sourceDate} aria-describedby={formError && !sourceDate ? 'uc20-form-error' : undefined} type="date" value={sourceDate} onChange={event => { setSourceDate(event.currentTarget.value); clearDemo(); setFormError(''); }}/>
          </label>
          <label htmlFor="uc20-source-label">Source label
            <input id="uc20-source-label" required aria-required="true" aria-invalid={!!formError && !sourceLabel.trim()} aria-describedby={formError && !sourceLabel.trim() ? 'uc20-form-error' : undefined} type="text" value={sourceLabel} maxLength={120} placeholder="Example: September cohort" onChange={event => { setSourceLabel(event.currentTarget.value); clearDemo(); setFormError(''); }}/>
          </label>
        </div>

        <div className={`uc20-dropzone${file ? ' uc20-dropzone-selected' : ''}`} onDragOver={event => event.preventDefault()} onDrop={onDrop}>
          <span className="uc20-file-mark" aria-hidden="true">CSV</span>
          <div className="uc20-file-copy">
            <label htmlFor="uc20-file">Choose a CSV file <span>or drop it here</span></label>
            <p id="uc20-file-help">.csv files up to 5 MiB. The file contents are not opened.</p>
          </div>
          <input ref={fileInput} id="uc20-file" type="file" accept=".csv,text/csv" aria-invalid={!!fileError} aria-describedby={`uc20-file-help${fileError ? ' uc20-file-error' : ''}`} onChange={onFileChange}/>
        </div>
        {file && <div className="uc20-file-selected" role="status">
          <span><strong>Selected file:</strong> {file.name} <small>({(file.size / 1024).toFixed(1)} KiB)</small></span>
          <button type="button" className="uc20-text-button" onClick={removeFile}>Remove file</button>
        </div>}
        {fileError && <p id="uc20-file-error" className="uc20-inline-error" role="alert">{fileError}</p>}
        <a className="uc20-template-link" href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_HEADER + '\n')}`} download="uc20-import.template.csv">Download blank CSV template</a>

        {formError && <p id="uc20-form-error" className="uc20-form-error" role="alert">{formError}</p>}
        <div className="uc20-actions">
          <button className="uc20-primary" type="submit">Load demo cohort</button>
          <button className="uc20-secondary" type="button" onClick={reset}>Reset</button>
        </div>
      </section>
    </form>

    {demoLoaded && <section className="uc20-results" aria-labelledby="uc20-results-heading" aria-live="polite">
      <div className="uc20-results-heading">
        <div><p className="uc20-eyebrow">SAMPLE FORECAST</p><h2 id="uc20-results-heading">Forecast preview</h2><p>Fixed example results for the selected preview scope. They are not calculated from the attached file.</p></div>
        <span className="uc20-sample-chip">DEMO DATA</span>
      </div>
      <div className="uc20-coverage-grid" aria-label="Sample cohort coverage">
        <article><span>Students in sample</span><strong>14</strong></article>
        <article><span>Complete history</span><strong>9</strong></article>
        <article><span>Uncertain history</span><strong>5</strong></article>
      </div>
      <div className="uc20-card uc20-table-card">
        <h3>Potential subject demand</h3>
        <p className="uc20-help">Supported-pool examples are not confirmed registration or a feasible semester workload.</p>
        <div className="uc20-table-scroll" role="region" aria-label="Sample potential subject demand" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Subject</th><th scope="col">Supported</th><th scope="col">Uncertain</th><th scope="col">Sample sections</th><th scope="col">Quality</th></tr></thead>
            <tbody>{sampleRows.map(row => <tr key={row.code}>
              <th scope="row"><strong>{row.code}</strong><span>{row.name}</span></th>
              <td>{row.eligible}</td><td>{row.uncertain}</td><td>{row.sections}</td>
              <td><span className={`uc20-quality${row.status === 'PRELIMINARY' ? ' uc20-quality-warning' : ' uc20-quality-info'}`}>{row.status}</span></td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="uc20-card uc20-exclusions">
        <div><h3>Excluded subjects</h3><p className="uc20-help">Example catalogue exclusions shown for the preview.</p></div>
        <ul>{sampleExclusions.map(item => <li key={item.code}><strong>{item.code}</strong><span>{item.reason}</span></li>)}</ul>
      </div>
    </section>}
  </div>;
}
