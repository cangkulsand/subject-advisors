import { useMemo, useState } from 'react';
import type { PathwayGraph, PathwayNodeStatus, PathwaySubjectNode } from './contracts';
import { layoutNodes } from './layout';

const NODE_WIDTH = 184;
const NODE_HEIGHT = 68;
const PADDING = 72;

const STATUS_META: Record<PathwayNodeStatus, { label: string; description: string }> = {
  COMPLETED: { label: 'Completed', description: 'Recorded as completed.' },
  EXEMPTED: { label: 'Exempted', description: 'Recorded as exempted; may carry zero recognized credits.' },
  IN_PROGRESS: { label: 'In progress', description: 'Currently being taken. Not derived from Sprint 1 records.' },
  ELIGIBLE: { label: 'Eligible', description: 'Prerequisites met. Not derived from Sprint 1 records.' },
  LOCKED: { label: 'Locked', description: 'A mandatory prerequisite is not yet satisfied.' },
  RECOMMENDED: { label: 'Recommended', description: 'Suggested next subject. Not derived from Sprint 1 records.' },
  REMAINING: { label: 'Remaining', description: 'Outstanding and not blocked by a mandatory prerequisite.' },
  UNKNOWN: { label: 'Not calculated', description: 'State cannot be derived from stored records yet.' },
};

export function Legend() {
  return (
    <ul className="pathway-legend" aria-label="Pathway status legend">
      {(Object.keys(STATUS_META) as PathwayNodeStatus[]).map(status => (
        <li key={status} className={`pathway-legend-item pathway-status-${status.toLowerCase()}`}>
          <span className="pathway-legend-swatch" aria-hidden="true" />
          <span>{STATUS_META[status].label}</span>
        </li>
      ))}
    </ul>
  );
}

export function TalentTree({ graph }: { graph: PathwayGraph }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  const positioned = useMemo(() => layoutNodes(graph.nodes, graph.edges), [graph]);
  const nodeById = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  const positionById = useMemo(() => new Map(positioned.map(node => [node.id, node])), [positioned]);

  const bounds = useMemo(() => {
    if (!positioned.length) return { minX: 0, minY: 0, width: 1, height: 1 };
    const minX = Math.min(...positioned.map(node => node.x)) - NODE_WIDTH / 2 - PADDING;
    const maxX = Math.max(...positioned.map(node => node.x)) + NODE_WIDTH / 2 + PADDING;
    const minY = Math.min(...positioned.map(node => node.y)) - NODE_HEIGHT / 2 - PADDING;
    const maxY = Math.max(...positioned.map(node => node.y)) + NODE_HEIGHT / 2 + PADDING;
    return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }, [positioned]);

  const selected = selectedId ? nodeById.get(selectedId) : undefined;

  function zoom(delta: number) {
    setScale(value => Math.min(2, Math.max(0.5, Number((value + delta).toFixed(2)))));
  }

  return (
    <div className="pathway-tree">
      <Legend />
      <div className="pathway-toolbar" role="toolbar" aria-label="Pathway view controls">
        <button type="button" onClick={() => zoom(0.25)}>Zoom in</button>
        <button type="button" onClick={() => zoom(-0.25)}>Zoom out</button>
        <button type="button" onClick={() => setScale(1)}>Fit to view</button>
      </div>
      <div className="pathway-canvas" role="region" aria-label="Interactive academic pathway graph">
        <svg
          width={bounds.width * scale}
          height={bounds.height * scale}
          viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
          role="img"
          aria-label="Prerequisite talent tree"
        >
          <defs>
            <marker id="pathway-arrow-mandatory" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="pathway-edge-mandatory" />
            </marker>
            <marker id="pathway-arrow-recommended" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="pathway-edge-recommended" />
            </marker>
          </defs>
          <g>
            {graph.edges.map(edge => {
              const source = positionById.get(edge.source);
              const target = positionById.get(edge.target);
              if (!source || !target) return null;
              const x1 = source.x + NODE_WIDTH / 2;
              const y1 = source.y;
              const x2 = target.x - NODE_WIDTH / 2;
              const y2 = target.y;
              const dx = Math.max(40, (x2 - x1) * 0.5);
              const marker = edge.requirementType === 'MANDATORY' ? 'url(#pathway-arrow-mandatory)' : 'url(#pathway-arrow-recommended)';
              const className = edge.requirementType === 'MANDATORY' ? 'pathway-edge pathway-edge-mandatory' : 'pathway-edge pathway-edge-recommended';
              return (
                <path
                  key={edge.id}
                  d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                  className={className}
                  markerEnd={marker}
                  aria-label={`${edge.requirementType.toLowerCase()} prerequisite`}
                />
              );
            })}
            {graph.nodes.map(node => {
              const position = positionById.get(node.id);
              if (!position) return null;
              const x = position.x - NODE_WIDTH / 2;
              const y = position.y - NODE_HEIGHT / 2;
              const statusClass = `pathway-node pathway-status-${node.status.toLowerCase()}`;
              const selectedClass = node.id === selectedId ? ' is-selected' : '';
              return (
                <g
                  key={node.id}
                  className={statusClass + selectedClass}
                  transform={`translate(${x} ${y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.subjectCode} ${node.subjectName}, ${node.creditHours} credits, ${STATUS_META[node.status].label}`}
                  aria-pressed={node.id === selectedId}
                  onClick={() => setSelectedId(node.id === selectedId ? null : node.id)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(node.id === selectedId ? null : node.id);
                    }
                  }}
                >
                  <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={12} className="pathway-node-box" />
                  <text x={14} y={22} className="pathway-node-code">{node.subjectCode}</text>
                  <text x={14} y={42} className="pathway-node-name">{node.subjectName}</text>
                  <text x={14} y={58} className="pathway-node-credits">{node.creditHours} credits{node.isCompulsory ? ' · compulsory' : ''}</text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      {selected && <NodeDetails node={selected} />}
    </div>
  );
}

function NodeDetails({ node }: { node: PathwaySubjectNode }) {
  const meta = STATUS_META[node.status];
  return (
    <aside className="pathway-node-details" aria-label="Selected subject details">
      <h3>{node.subjectCode} — {node.subjectName}</h3>
      <dl>
        <dt>Credits</dt><dd>{node.creditHours}</dd>
        <dt>Category</dt><dd>{node.subjectCategory ?? 'Not set'}</dd>
        <dt>Status</dt><dd>{meta.label}</dd>
        {node.grade && <><dt>Grade</dt><dd>{node.grade}</dd></>}
        {node.recognizedCredits !== null && <><dt>Recognized credits</dt><dd>{node.recognizedCredits}</dd></>}
      </dl>
      <p>{meta.description}</p>
    </aside>
  );
}
