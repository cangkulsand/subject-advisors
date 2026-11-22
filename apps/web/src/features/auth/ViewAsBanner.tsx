import { exitViewAs, readViewAs } from './view-as';

/** Shown on every page while a System Admin views as someone else (S3-P004-033). */
export function ViewAsBanner() {
  const view = readViewAs();
  if (!view) return null;
  const text = view.role === 'COORDINATOR' ? `Viewing as coordinator — ${view.label}` : `Viewing as student — ${view.label} (read only)`;
  return <div className="view-as-banner" role="status">
    <span>{text}</span>
    <button type="button" className="view-as-exit" onClick={exitViewAs}>Exit view</button>
  </div>;
}
