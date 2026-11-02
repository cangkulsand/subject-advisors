import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PathwayGraph, PathwayNodeStatus, PathwaySubjectNode } from './contracts';
import { GROUP_HEADER_HEIGHT, GROUP_PADDING, LEVEL_HEIGHT, NODE_HEIGHT, NODE_WIDTH, groupIndependentSubjects, layoutNodes } from './layout';
import { buildPathwayEdgeRoutes } from './routing';

const PADDING = 28;
const MIN_SCALE = 0.05;
const MAX_SCALE = 2;
const SATISFIED_STATUSES = new Set<PathwayNodeStatus>(['COMPLETED', 'EXEMPTED']);

function wrapText(value: string, maxLength: number) {
  const words = value.split(/\s+/).filter(Boolean).flatMap(word =>
    word.match(new RegExp(`.{1,${maxLength}}`, 'g')) ?? []);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxLength) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2).map((line, index) =>
    index === 1 && lines.length > 2 ? `${line.slice(0, maxLength - 3)}...` : line);
}

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
  const [scale, setScale] = useState<number | null>(null);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const [panning, setPanning] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const graphId = useId();

  const positioned = useMemo(() => layoutNodes(graph.nodes, graph.edges), [graph]);
  const nodeById = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  const positionById = useMemo(() => new Map(positioned.map(node => [node.id, node])), [positioned]);
  const panels = useMemo(() => groupIndependentSubjects(graph.nodes, graph.edges).map(group => {
    const positions = group.nodes.map(node => positionById.get(node.id)!);
    const minX = Math.min(...positions.map(node => node.x)) - NODE_WIDTH / 2 - GROUP_PADDING;
    const minY = Math.min(...positions.map(node => node.y)) - NODE_HEIGHT / 2 - GROUP_HEADER_HEIGHT;
    return {
      ...group, x: minX, y: minY,
      width: Math.max(...positions.map(node => node.x)) + NODE_WIDTH / 2 + GROUP_PADDING - minX,
      height: Math.max(...positions.map(node => node.y)) + NODE_HEIGHT / 2 + GROUP_PADDING - minY,
    };
  }), [graph.nodes, graph.edges, positionById]);
  const routes = useMemo(
    () => buildPathwayEdgeRoutes(graph.edges, positioned, { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT, levelHeight: LEVEL_HEIGHT }),
    [graph.edges, positioned],
  );

  const bounds = useMemo(() => {
    if (!positioned.length) return { minX: 0, minY: 0, width: 1, height: 1 };
    const routeXs = [...routes.values()].flatMap(route => route.segments.flatMap(segment => [segment.x1, segment.x2]));
    const routeYs = [...routes.values()].flatMap(route => route.segments.flatMap(segment => [segment.y1, segment.y2]));
    const minX = Math.min(...positioned.map(node => node.x - NODE_WIDTH / 2), ...routeXs, ...panels.map(panel => panel.x)) - PADDING;
    const maxX = Math.max(...positioned.map(node => node.x + NODE_WIDTH / 2), ...routeXs, ...panels.map(panel => panel.x + panel.width)) + PADDING;
    const minY = Math.min(...positioned.map(node => node.y - NODE_HEIGHT / 2), ...routeYs, ...panels.map(panel => panel.y)) - PADDING;
    const maxY = Math.max(...positioned.map(node => node.y + NODE_HEIGHT / 2), ...routeYs, ...panels.map(panel => panel.y + panel.height)) + PADDING;
    return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }, [positioned, routes, panels]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      setViewport({ width: canvas.clientWidth, height: canvas.clientHeight });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const fitScale = Math.max(MIN_SCALE, Math.min(1, (viewport.width - 24) / bounds.width, (viewport.height - 24) / bounds.height));
  const displayedScale = scale ?? fitScale;

  const selected = selectedId ? nodeById.get(selectedId) : undefined;

  const focusSet = useMemo(() => {
    if (!selectedId || !nodeById.has(selectedId)) return null;
    const result = new Set<string>();
    const visit = (id: string) => {
      if (result.has(id)) return;
      result.add(id);
      for (const edge of graph.edges) {
        if (edge.target === id) visit(edge.source);
      }
    };
    visit(selectedId);
    return result;
  }, [selectedId, graph, nodeById]);

  const orderedEdges = useMemo(() => {
    const priority = (source: string, target: string) => focusSet?.has(source) && focusSet.has(target) ? 1 : 0;
    return [...graph.edges].sort((a, b) => priority(a.source, a.target) - priority(b.source, b.target));
  }, [graph.edges, focusSet]);

  function zoom(delta: number) {
    setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number((displayedScale + delta).toFixed(2)))));
  }

  function fit() {
    setScale(null);
    canvasRef.current?.scrollTo(0, 0);
  }

  return (
    <div className="pathway-tree" onKeyDown={event => {
      if (event.key === 'Escape') setSelectedId(null);
    }}>
      <div className="pathway-map-heading">
        <div><h2>Curriculum prerequisite map</h2><p>Read from top to bottom. Select a subject to inspect it.</p></div>
        <span>{graph.nodes.length} subjects · {routes.size} links</span>
      </div>
      <div className="pathway-map-legend">
        <div className="pathway-link-legend" aria-label="Prerequisite relationship legend">
          <span><i className="pathway-link-sample" aria-hidden="true" />Mandatory prerequisite</span>
          <span><i className="pathway-link-sample is-recommended" aria-hidden="true" />Recommended prior knowledge</span>
          <span><i className="pathway-link-sample is-corequisite" aria-hidden="true" />Corequisite</span>
          <span><i className="pathway-link-sample is-completed" aria-hidden="true" />Completed path</span>
          <span><i className="pathway-link-sample is-highlighted" aria-hidden="true" />Highlighted path (thicker line)</span>
        </div>
        <Legend />
      </div>
      <div className="pathway-toolbar" role="toolbar" aria-label="Pathway view controls">
        <button type="button" onClick={() => zoom(0.15)} disabled={displayedScale >= MAX_SCALE}>Zoom in</button>
        <button type="button" onClick={() => zoom(-0.15)} disabled={displayedScale <= MIN_SCALE}>Zoom out</button>
        <output aria-label="Zoom level">{Math.round(displayedScale * 100)}%</output>
        <button type="button" onClick={fit}>Fit to view</button>
        <button type="button" onClick={() => setScale(1)}>Actual size</button>
        <button type="button" onClick={() => setSelectedId(null)} disabled={selectedId === null}>Unselect node</button>
      </div>
      <div
        ref={canvasRef}
        className={`pathway-canvas${panning ? ' is-panning' : ''}`}
        role="region"
        tabIndex={0}
        aria-label="Interactive academic pathway graph"
        aria-describedby={`${graphId}-help`}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          const movement: Record<string, [number, number]> = { ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80] };
          if (movement[event.key]) {
            event.preventDefault();
            event.currentTarget.scrollBy(...movement[event.key]!);
          } else if (event.key === '+' || event.key === '-' || event.key === 'Home') {
            event.preventDefault();
            if (event.key === 'Home') fit();
            else zoom(event.key === '+' ? 0.15 : -0.15);
          }
        }}
        onPointerDown={event => {
          if (event.pointerType !== 'mouse' || event.button !== 0 || (event.target as Element).closest('[role="button"]')) return;
          dragRef.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
          event.currentTarget.setPointerCapture(event.pointerId);
          setPanning(true);
        }}
        onPointerMove={event => {
          const drag = dragRef.current;
          if (!drag) return;
          event.currentTarget.scrollTo(drag.left + drag.x - event.clientX, drag.top + drag.y - event.clientY);
        }}
        onPointerUp={() => { dragRef.current = null; setPanning(false); }}
        onPointerCancel={() => { dragRef.current = null; setPanning(false); }}
        onLostPointerCapture={() => { dragRef.current = null; setPanning(false); }}
      >
        <svg
          width={bounds.width * displayedScale}
          height={bounds.height * displayedScale}
          viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
          role="group"
          aria-label="Prerequisite talent tree"
        >
          <defs>
            <marker id={`${graphId}-arrow-mandatory`} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" className="pathway-edge-mandatory" />
            </marker>
            <marker id={`${graphId}-arrow-recommended`} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" className="pathway-edge-recommended" />
            </marker>
            <marker id={`${graphId}-arrow-completed`} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" className="pathway-edge-completed" />
            </marker>
          </defs>
          <g>
            {panels.map(panel => (
              <g key={panel.key} className="pathway-category-panel" data-subject-group={panel.key} aria-label={`${panel.label}: no configured prerequisite links`}>
                <rect x={panel.x} y={panel.y} width={panel.width} height={panel.height} rx={4} />
                <text x={panel.x + 14} y={panel.y + 22} className="pathway-category-title">{panel.label}</text>
                <text x={panel.x + 14} y={panel.y + 40} className="pathway-category-note">No configured prerequisite links</text>
              </g>
            ))}
            {orderedEdges.map(edge => {
              const source = positionById.get(edge.source);
              const target = positionById.get(edge.target);
              if (!source || !target) return null;
              const route = routes.get(edge.id);
              if (!route) return null;
              const inFocus = !focusSet || (focusSet.has(edge.source) && focusSet.has(edge.target));
              const highlighted = focusSet !== null && inFocus;
              const completed = SATISFIED_STATUSES.has(nodeById.get(edge.source)?.status ?? 'UNKNOWN') && SATISFIED_STATUSES.has(nodeById.get(edge.target)?.status ?? 'UNKNOWN');
              const marker = completed
                ? `url(#${graphId}-arrow-completed)`
                : `url(#${graphId}-arrow-${edge.requirementType === 'MANDATORY' ? 'mandatory' : 'recommended'})`;
              const className = [
                'pathway-edge',
                `pathway-edge-${edge.requirementType.toLowerCase()}`,
                completed ? 'pathway-edge-completed' : '',
                highlighted ? 'is-highlighted' : '',
              ].filter(Boolean).join(' ');
              return (
                <g key={edge.id} className={`pathway-connection${inFocus ? '' : ' is-dimmed'}`} data-edge-id={edge.id}>
                  <path d={route.d} className="pathway-edge-halo" aria-hidden="true" />
                  <path
                    d={route.d}
                    className={className}
                    markerEnd={marker}
                    aria-label={`${edge.requirementType.toLowerCase()}: ${nodeById.get(edge.source)?.subjectCode} to ${nodeById.get(edge.target)?.subjectCode}`}
                  />
                </g>
              );
            })}
            {graph.nodes.map(node => {
              const position = positionById.get(node.id);
              if (!position) return null;
              const x = position.x - NODE_WIDTH / 2;
              const y = position.y - NODE_HEIGHT / 2;
              const statusClass = `pathway-node pathway-status-${node.status.toLowerCase()}`;
              const selectedClass = node.id === selectedId ? ' is-selected' : '';
              const dimmedClass = focusSet && !focusSet.has(node.id) ? ' is-dimmed' : '';
              const nameLines = wrapText(node.subjectName, 24);
              return (
                <g
                  key={node.id}
                  className={statusClass + selectedClass + dimmedClass}
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
                  <title>{node.subjectCode} — {node.subjectName}: {STATUS_META[node.status].label}</title>
                  <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={4} className="pathway-node-box" />
                  <circle cx={NODE_WIDTH - 14} cy={18} r={4} className="pathway-node-status-dot" />
                  <text x={14} y={22} className="pathway-node-code">{node.subjectCode}</text>
                  <text x={14} y={42} className="pathway-node-name">
                    {nameLines.map((line, index) => (
                      <tspan key={index} x={14} dy={index === 0 ? 0 : 16}>{line}</tspan>
                    ))}
                  </text>
                  <text x={14} y={nameLines.length > 1 ? 76 : 58} className="pathway-node-credits">{node.creditHours} credits{node.isCompulsory ? ' · compulsory' : ''}</text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <p className="pathway-canvas-help" id={`${graphId}-help`}>Drag the background or swipe to pan. Use Tab and Enter to select subjects; Escape clears selection. Focus the map and use arrow keys to pan, +/− to zoom, or Home to fit.</p>
      {selected && <NodeDetails node={selected} graph={graph} />}
    </div>
  );
}

function NodeDetails({ node, graph }: { node: PathwaySubjectNode; graph: PathwayGraph }) {
  const meta = STATUS_META[node.status];
  const incoming = graph.edges.filter(edge => edge.target === node.id);
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
      {node.prerequisiteSummary && <p><strong>Curriculum prerequisite information:</strong> {node.prerequisiteSummary}</p>}
      <h4>Configured prerequisites</h4>
      {incoming.length ? (
        <ul className="pathway-detail-prereqs">
          {incoming.map(edge => {
            const source = graph.nodes.find(subject => subject.id === edge.source);
            if (!source) return null;
            const relationship = edge.requirementType === 'COREQUISITE' ? 'Corequisite' : edge.requirementType === 'MANDATORY' ? 'Mandatory prerequisite' : 'Recommended prior knowledge';
            return <li key={edge.id}><strong>{source.subjectCode}</strong> — {source.subjectName}<span>{relationship} · {STATUS_META[source.status].label}</span></li>;
          })}
        </ul>
      ) : <p>No prerequisite links are configured for this subject. Other programme requirements may still apply.</p>}
    </aside>
  );
}
