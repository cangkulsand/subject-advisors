import type { PathwayPrerequisiteEdge } from './contracts';
import type { PositionedNode } from './layout';

export interface PathwayRouteSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PathwayEdgeRoute {
  id: string;
  d: string;
  segments: readonly PathwayRouteSegment[];
}

interface RoutingOptions {
  nodeWidth: number;
  nodeHeight: number;
  levelHeight: number;
}

type RoutableEdge = {
  edge: PathwayPrerequisiteEdge;
  source: PositionedNode;
  target: PositionedNode;
};

const SOURCE_GAP = 0;
const TARGET_GAP = 0;
const SIDE_GAP = 20;
const SIDE_LANE_WIDTH = 18;
const PORT_MARGIN = 26;
const PORT_STEP = 18;

export function buildPathwayEdgeRoutes(
  edges: readonly PathwayPrerequisiteEdge[],
  positioned: readonly PositionedNode[],
  { nodeWidth, nodeHeight, levelHeight }: RoutingOptions,
): Map<string, PathwayEdgeRoute> {
  const positionById = new Map(positioned.map(node => [node.id, node]));
  const routableEdges = edges
    .map(edge => ({ edge, source: positionById.get(edge.source), target: positionById.get(edge.target) }))
    .filter((entry): entry is { edge: PathwayPrerequisiteEdge; source: PositionedNode; target: PositionedNode } => entry.source !== undefined && entry.target !== undefined)
    .sort(compareRoutableEdges);
  if (routableEdges.length === 0) return new Map();

  const sourcePorts = assignPorts(routableEdges, entry => entry.edge.source, entry => entry.target.x, nodeWidth);
  const targetPorts = assignPorts(routableEdges, entry => entry.edge.target, entry => entry.source.x, nodeWidth);
  separateTargetPorts(routableEdges, sourcePorts, targetPorts, nodeWidth);
  const gapGroups = new Map<number, RoutableEdge[]>();
  const gapLanes = new Map<string, { index: number; count: number }>();

  for (const entry of routableEdges) {
    addGapEntry(gapGroups, entry.source.depth, entry);
    if (entry.target.depth - 1 !== entry.source.depth) addGapEntry(gapGroups, entry.target.depth - 1, entry);
  }

  for (const [gap, group] of gapGroups.entries()) {
    group.sort(compareRoutableEdges);
    group.forEach((entry, index) => gapLanes.set(laneKey(entry.edge.id, gap), { index, count: group.length }));
  }

  const portSegments = routableEdges.map(entry => ({
    id: entry.edge.id,
    segments: [
      {
        x1: entry.source.x + sourcePorts.get(entry.edge.id)!, x2: entry.source.x + sourcePorts.get(entry.edge.id)!,
        y1: entry.source.y + nodeHeight / 2,
        y2: gapLaneY(entry.source.depth, entry.edge.id, gapLanes, nodeHeight, levelHeight),
      },
      {
        x1: entry.target.x + targetPorts.get(entry.edge.id)!, x2: entry.target.x + targetPorts.get(entry.edge.id)!,
        y1: gapLaneY(entry.target.depth - 1, entry.edge.id, gapLanes, nodeHeight, levelHeight),
        y2: entry.target.y - nodeHeight / 2,
      },
    ],
  }));
  const result = new Map<string, PathwayEdgeRoute>();

  for (const entry of routableEdges) {
    const sourceOffset = sourcePorts.get(entry.edge.id) ?? 0;
    const targetOffset = targetPorts.get(entry.edge.id) ?? 0;
    const x1 = entry.source.x + sourceOffset;
    const y1 = entry.source.y + nodeHeight / 2 + SOURCE_GAP;
    const x2 = entry.target.x + targetOffset;
    const y2 = entry.target.y - nodeHeight / 2 - TARGET_GAP;
    const depthGap = entry.target.depth - entry.source.depth;
    let segments: PathwayRouteSegment[];

    if (depthGap === 1) {
      const laneY = gapLaneY(entry.source.depth, entry.edge.id, gapLanes, nodeHeight, levelHeight);
      segments = toSegments([
        [x1, y1],
        [x1, laneY],
        [x2, laneY],
        [x2, y2],
      ]);
    } else {
      const startY = gapLaneY(entry.source.depth, entry.edge.id, gapLanes, nodeHeight, levelHeight);
      const endY = gapLaneY(entry.target.depth - 1, entry.edge.id, gapLanes, nodeHeight, levelHeight);
      const reserved = [
        ...portSegments.filter(port => port.id !== entry.edge.id).flatMap(port => port.segments),
        ...[...result.values()].flatMap(route => route.segments),
      ];
      const sideX = findCorridor(x1, x2, startY, endY, positioned, nodeWidth, nodeHeight, reserved);
      segments = toSegments([
        [x1, y1],
        [x1, startY],
        [sideX, startY],
        [sideX, endY],
        [x2, endY],
        [x2, y2],
      ]);
    }

    result.set(entry.edge.id, {
      id: entry.edge.id,
      d: toPath(segments),
      segments,
    });
  }

  return result;
}

function findCorridor(
  sourceX: number,
  targetX: number,
  startY: number,
  endY: number,
  nodes: readonly PositionedNode[],
  nodeWidth: number,
  nodeHeight: number,
  reserved: readonly PathwayRouteSegment[],
) {
  // Only the vertical leg needs a clear gutter; its horizontal legs use level gaps.
  const minY = Math.min(startY, endY);
  const maxY = Math.max(startY, endY);
  const obstacles = nodes.filter(node => node.y + nodeHeight / 2 > minY && node.y - nodeHeight / 2 < maxY);
  const verticals = reserved.filter(segment => segment.x1 === segment.x2 && Math.min(segment.y1, segment.y2) < maxY && Math.max(segment.y1, segment.y2) > minY);
  const candidates = [sourceX, targetX, (sourceX + targetX) / 2];
  for (const node of nodes) {
    for (const direction of [-1, 1]) {
      candidates.push(node.x + direction * (nodeWidth / 2 + SIDE_GAP));
    }
  }
  for (const segment of verticals) candidates.push(segment.x1 - SIDE_LANE_WIDTH, segment.x1 + SIDE_LANE_WIDTH);
  const available = candidates.filter(x =>
    verticals.every(segment => Math.abs(segment.x1 - x) >= 6) &&
    obstacles.every(node => Math.abs(node.x - x) >= nodeWidth / 2 + 8));
  available.sort((a, b) => (Math.abs(sourceX - a) + Math.abs(targetX - a)) - (Math.abs(sourceX - b) + Math.abs(targetX - b)) || a - b);
  if (available.length) return available[0]!;
  return Math.max(...nodes.map(node => node.x + nodeWidth / 2), ...verticals.map(segment => segment.x1)) + SIDE_GAP;
}

function separateTargetPorts(
  entries: readonly RoutableEdge[],
  sourcePorts: ReadonlyMap<string, number>,
  targetPorts: Map<string, number>,
  nodeWidth: number,
) {
  const occupied = new Map<number, { id: string; x: number }[]>();
  for (const entry of entries) {
    const ports = occupied.get(entry.source.depth) ?? [];
    ports.push({ id: entry.edge.id, x: entry.source.x + sourcePorts.get(entry.edge.id)! });
    occupied.set(entry.source.depth, ports);
  }
  const max = nodeWidth / 2 - PORT_MARGIN;
  for (const entry of entries) {
    const gap = entry.target.depth - 1;
    const ports = occupied.get(gap) ?? [];
    const preferred = targetPorts.get(entry.edge.id)!;
    const candidates = [preferred];
    for (let offset = -max; offset <= max; offset += 0.5) candidates.push(offset);
    candidates.sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred) || a - b);
    // Departures and arrivals can occupy the same gap even on different nodes.
    // Give each edge its own x port so opposing vertical legs cannot merge.
    const available = (clearance: number) => candidates.find(offset =>
      ports.every(port => port.id === entry.edge.id || Math.abs(port.x - entry.target.x - offset) >= clearance));
    const offset = available(6) ?? available(0.1) ?? preferred;
    targetPorts.set(entry.edge.id, offset);
    ports.push({ id: entry.edge.id, x: entry.target.x + offset });
    occupied.set(gap, ports);
  }
}

function compareRoutableEdges(a: RoutableEdge, b: RoutableEdge) {
  return (
    a.source.depth - b.source.depth ||
    a.target.depth - b.target.depth ||
    a.source.x - b.source.x ||
    a.target.x - b.target.x ||
    a.edge.id.localeCompare(b.edge.id)
  );
}

function assignPorts(
  entries: readonly RoutableEdge[],
  groupBy: (entry: RoutableEdge) => string,
  sortBy: (entry: RoutableEdge) => number,
  nodeWidth: number,
) {
  const groups = new Map<string, RoutableEdge[]>();
  for (const entry of entries) {
    const key = groupBy(entry);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  const result = new Map<string, number>();
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => sortBy(a) - sortBy(b) || a.edge.id.localeCompare(b.edge.id));
    sorted.forEach((entry, index) => result.set(entry.edge.id, portOffset(index, sorted.length, nodeWidth)));
  }
  return result;
}

function portOffset(index: number, count: number, nodeWidth: number) {
  if (count <= 1) return 0;
  const max = nodeWidth / 2 - PORT_MARGIN;
  const step = Math.min(PORT_STEP, (max * 2) / (count - 1));
  return (index - (count - 1) / 2) * step;
}

function addGapEntry(groups: Map<number, RoutableEdge[]>, gap: number, entry: RoutableEdge) {
  const group = groups.get(gap) ?? [];
  group.push(entry);
  groups.set(gap, group);
}

function laneKey(edgeId: string, gap: number) {
  return `${edgeId}:${gap}`;
}

function gapLaneY(
  gap: number,
  edgeId: string,
  lanes: ReadonlyMap<string, { index: number; count: number }>,
  nodeHeight: number,
  levelHeight: number,
) {
  const lane = lanes.get(laneKey(edgeId, gap)) ?? { index: 0, count: 1 };
  const start = gap * levelHeight + nodeHeight / 2 + SOURCE_GAP + 10;
  const end = (gap + 1) * levelHeight - nodeHeight / 2 - TARGET_GAP - 10;
  return start + ((end - start) * (lane.index + 1)) / (lane.count + 1);
}

function toSegments(points: readonly (readonly [number, number])[]) {
  const segments: PathwayRouteSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    if (previous[0] === current[0] && previous[1] === current[1]) continue;
    segments.push({ x1: previous[0], y1: previous[1], x2: current[0], y2: current[1] });
  }
  return segments;
}

function toPath(segments: readonly PathwayRouteSegment[]) {
  if (segments.length === 0) return '';
  const first = segments[0]!;
  const commands = [`M ${format(first.x1)} ${format(first.y1)}`];
  for (const segment of segments) commands.push(`L ${format(segment.x2)} ${format(segment.y2)}`);
  return commands.join(' ');
}

function format(value: number) {
  return Number(value.toFixed(2));
}
