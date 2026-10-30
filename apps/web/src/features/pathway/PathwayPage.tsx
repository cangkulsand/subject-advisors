import { useEffect, useMemo, useState, type ComponentType } from 'react';
import type { StudentPageProps } from '../../app/feature-contracts';
import { AppLink } from '../../app/navigation';
import type { PathwayGraph, PathwaySubjectNode } from './contracts';
import { PathwayApiError, loadPathwayGraph } from './client';
import { DEMO_PATHWAY_GRAPH } from './demo';
import { Legend, TalentTree } from './TalentTree';
import './pathway.css';

type ViewMode = 'graph' | 'list';

export const PathwayPage: ComponentType<StudentPageProps> = ({ getToken }) => {
  const [graph, setGraph] = useState<PathwayGraph | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('graph');
  const [showDemo, setShowDemo] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    loadPathwayGraph(getToken, '', controller.signal).then(
      value => { if (active) { setGraph(value); setLoading(false); } },
      reason => { if (active) { setError(reason instanceof Error ? reason : new Error('Academic pathway is unavailable.')); setLoading(false); } },
    );
    return () => { active = false; controller.abort(); };
  }, [getToken, attempt]);

  const displayed = showDemo ? DEMO_PATHWAY_GRAPH : graph;

  if (loading) return <section className="pathway-page" role="status"><h1>Academic pathway</h1><p>Loading your curriculum map…</p></section>;

  if (error) {
    return (
      <section className="pathway-page">
        <h1>Academic pathway</h1>
        <p role="alert">{error instanceof PathwayApiError ? error.message : 'Unable to load your academic pathway. Please retry.'}</p>
        <button type="button" onClick={() => setAttempt(n => n + 1)}>Retry</button>
        <p className="pathway-note">Advisory roadmap — future offerings and graduation dates are not guaranteed.</p>
      </section>
    );
  }

  if (!displayed) {
    return (
      <section className="pathway-page">
        <h1>Academic pathway</h1>
        <p role="status">Your curriculum map is not available yet.</p>
        <p className="pathway-note">Advisory roadmap — future offerings and graduation dates are not guaranteed.</p>
      </section>
    );
  }

  return (
    <section className="pathway-page">
      <header className="pathway-header">
        <div>
          <h1>Academic pathway</h1>
          <p className="pathway-subtitle">
            {displayed.programmeName} · Curriculum {displayed.curriculumVersion}
          </p>
        </div>
        <div className="pathway-actions">
          <button type="button" onClick={() => setView(view === 'graph' ? 'list' : 'graph')}>
            {view === 'graph' ? 'Switch to list view' : 'Switch to graph view'}
          </button>
          <button type="button" onClick={() => setShowDemo(value => !value)}>
            {showDemo ? 'Show my real pathway' : 'Preview demo'}
          </button>
        </div>
      </header>

      {displayed.demo && (
        <p className="pathway-demo-banner" role="note">
          Demonstration data only — not official UTMSPACE data. Switch back to your real pathway for saved records.
        </p>
      )}

      {displayed.nodes.length === 0 ? (
        <section className="pathway-empty">
          <h2>No subjects in your curriculum yet</h2>
          <p>Your curriculum has no mapped subjects. Once your programme catalogue is configured, your prerequisite map will appear here.</p>
          <p>You can also <AppLink href="/student/records">add subject records</AppLink> to reflect your academic history.</p>
        </section>
      ) : view === 'graph' ? (
        <TalentTree graph={displayed} />
      ) : (
        <PathwayList graph={displayed} />
      )}

      <p className="pathway-note">Advisory roadmap — future offerings and graduation dates are not guaranteed. Subject statuses reflect your saved records and configured prerequisites only.</p>
    </section>
  );
};

function PathwayList({ graph }: { graph: PathwayGraph }) {
  const byId = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  return (
    <div className="pathway-list">
      <Legend />
      <ol aria-label="Curriculum subjects">
        {graph.nodes.map(node => (
          <li key={node.id} className={`pathway-list-item pathway-status-${node.status.toLowerCase()}`}>
            <div className="pathway-list-item-head">
              <strong>{node.subjectCode}</strong>
              <span>{node.creditHours} credits{node.isCompulsory ? ' · compulsory' : ''}</span>
            </div>
            <div>{node.subjectName}</div>
            <div className="pathway-list-item-status">{statusLabel(node)}</div>
            <PrerequisiteSummary node={node} graph={graph} byId={byId} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function PrerequisiteSummary({ node, graph, byId }: { node: PathwaySubjectNode; graph: PathwayGraph; byId: Map<string, PathwaySubjectNode> }) {
  const incoming = graph.edges.filter(edge => edge.target === node.id);
  if (!incoming.length) return null;
  return (
    <ul className="pathway-list-prereqs" aria-label="Prerequisites">
      {incoming.map(edge => {
        const source = byId.get(edge.source);
        return (
          <li key={edge.id}>
            {edge.requirementType.toLowerCase()} prerequisite: {source ? `${source.subjectCode} ${source.subjectName}` : edge.source}
          </li>
        );
      })}
    </ul>
  );
}

function statusLabel(node: PathwaySubjectNode): string {
  const labels: Record<string, string> = {
    COMPLETED: 'Completed', EXEMPTED: 'Exempted', IN_PROGRESS: 'In progress', ELIGIBLE: 'Eligible',
    LOCKED: 'Locked', RECOMMENDED: 'Recommended', REMAINING: 'Remaining', UNKNOWN: 'Not calculated',
  };
  return labels[node.status] ?? node.status;
}
