import type { PathwayPrerequisiteEdge, PathwaySubjectNode } from './contracts';
import { subjectGroupForCategory, type SubjectGroup } from '../records/subject-groups';

export interface PositionedNode {
  id: string;
  x: number;
  y: number;
  depth: number;
}

export const NODE_WIDTH = 184;
export const NODE_HEIGHT = 84;
export const SIBLING_WIDTH = 232;
export const LEVEL_HEIGHT = 156;
export const GROUP_PADDING = 18;
export const GROUP_HEADER_HEIGHT = 56;

export function groupIndependentSubjects(
  nodes: readonly PathwaySubjectNode[],
  edges: readonly PathwayPrerequisiteEdge[],
) {
  const ids = new Set(nodes.map(node => node.id));
  const connected = new Set(edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)).flatMap(edge => [edge.source, edge.target]));
  const subjects: Record<SubjectGroup, PathwaySubjectNode[]> = { CORE: [], ELECTIVE: [], OTHER: [] };
  for (const node of nodes) {
    if (!connected.has(node.id)) {
      subjects[subjectGroupForCategory(node.subjectCategory, node.isCompulsory ? 1 : 0)].push(node);
    }
  }
  const labels: Record<SubjectGroup, string> = { CORE: 'Core subjects', ELECTIVE: 'Elective subjects', OTHER: 'Other subjects' };
  return (Object.keys(subjects) as SubjectGroup[]).filter(key => subjects[key].length > 0).map(key => ({
    key, label: labels[key],
    nodes: subjects[key].sort((a, b) => a.subjectCode.localeCompare(b.subjectCode) || a.id.localeCompare(b.id)),
  }));
}

/**
 * Layered top-down layout for the prerequisite talent tree, matching an
 * organizational-chart style. Depth is the longest prerequisite chain from a root
 * subject, drawn downward. Nodes within each layer are ordered with a barycenter
 * heuristic to reduce arrow crossings. Disconnected components are placed side by
 * side. Only subjects without configured links sit in category panels below
 * the flowchart rather than stretching its root row indefinitely.
 */
export function layoutNodes(
  nodes: readonly PathwaySubjectNode[],
  edges: readonly PathwayPrerequisiteEdge[],
): PositionedNode[] {
  if (nodes.length === 0) return [];

  const codeById = new Map(nodes.map(node => [node.id, node.subjectCode]));
  const parents = new Map<string, string[]>(); // prerequisites
  const children = new Map<string, string[]>(); // dependents
  for (const edge of edges) {
    if (!codeById.has(edge.source) || !codeById.has(edge.target)) continue;
    const list = parents.get(edge.target) ?? [];
    list.push(edge.source);
    parents.set(edge.target, list);
    const kids = children.get(edge.source) ?? [];
    kids.push(edge.target);
    children.set(edge.source, kids);
  }

  // Connected components (undirected) so isolated subjects are grouped apart.
  const components: string[][] = [];
  const visited = new Set<string>();
  for (const node of [...nodes].sort((a, b) => a.subjectCode.localeCompare(b.subjectCode) || a.id.localeCompare(b.id))) {
    if (visited.has(node.id)) continue;
    const component: string[] = [];
    const stack = [node.id];
    visited.add(node.id);
    while (stack.length) {
      const id = stack.pop()!;
      component.push(id);
      for (const neighbour of [...(parents.get(id) ?? []), ...(children.get(id) ?? [])]) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          stack.push(neighbour);
        }
      }
    }
    component.sort((a, b) => (codeById.get(a) ?? '').localeCompare(codeById.get(b) ?? ''));
    components.push(component);
  }

  const depthCache = new Map<string, number>();
  const depthOf = (id: string, visiting: Set<string>): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const sources = parents.get(id) ?? [];
    const depth = sources.length === 0 ? 0 : 1 + Math.max(...sources.map(source => depthOf(source, visiting)));
    visiting.delete(id);
    depthCache.set(id, depth);
    return depth;
  };
  for (const node of nodes) depthOf(node.id, new Set());

  const x = new Map<string, number>();
  let xOffset = 0;

  for (const component of components) {
    if (!component.some(id => parents.has(id) || children.has(id))) continue;
    const componentSet = new Set(component);
    const maxDepth = Math.max(0, ...component.map(id => depthCache.get(id)!));
    const layers: string[][] = Array.from({ length: maxDepth + 1 }, () => []);
    for (const id of component) layers[depthCache.get(id)!]!.push(id);
    for (const layer of layers) layer.sort((a, b) => (codeById.get(a) ?? '').localeCompare(codeById.get(b) ?? ''));

    // Barycenter ordering: sort each layer by the average position of its
    // neighbours in the adjacent layer, which reduces arrow crossings.
    const index = new Map<string, number>();
    const rebuildIndex = () => {
      index.clear();
      for (const layer of layers) layer.forEach((id, i) => index.set(id, i));
    };
    rebuildIndex();

    const sortLayer = (layer: string[], neighbours: (id: string) => string[]) => {
      const barycenter = new Map<string, number>();
      for (const id of layer) {
        const adjacent = neighbours(id);
        barycenter.set(
          id,
          adjacent.length === 0
            ? index.get(id)!
            : adjacent.reduce((sum, neighbour) => sum + (index.get(neighbour) ?? 0), 0) / adjacent.length,
        );
      }
      layer.sort((a, b) => (barycenter.get(a)! - barycenter.get(b)!) || (codeById.get(a) ?? '').localeCompare(codeById.get(b) ?? ''));
    };

    for (let pass = 0; pass < 4; pass++) {
      for (let depth = 1; depth <= maxDepth; depth++) {
        sortLayer(layers[depth]!, id => (parents.get(id) ?? []).filter(source => componentSet.has(source)));
        layers[depth]!.forEach((id, i) => index.set(id, i));
      }
      for (let depth = maxDepth - 1; depth >= 0; depth--) {
        sortLayer(layers[depth]!, id => (children.get(id) ?? []).filter(target => componentSet.has(target)));
        layers[depth]!.forEach((id, i) => index.set(id, i));
      }
    }

    const relativeX = centerLayerPositions(layers, parents, children, componentSet);
    const componentMinX = Math.min(...component.map(id => relativeX.get(id)!));
    const componentMaxX = Math.max(...component.map(id => relativeX.get(id)!));
    for (const id of component) {
      x.set(id, xOffset + relativeX.get(id)! - componentMinX);
    }
    xOffset += componentMaxX - componentMinX + 1.35;
  }

  const positioned = nodes.filter(node => x.has(node.id)).map(node => ({
    id: node.id,
    x: x.get(node.id)! * SIBLING_WIDTH,
    y: depthCache.get(node.id)! * LEVEL_HEIGHT,
    depth: depthCache.get(node.id)!,
  }));
  const columns = positioned.length ? Math.max(3, Math.min(6, Math.ceil(xOffset))) : 6;
  let shelfX = 0;
  let shelfY = (positioned.length ? Math.max(...positioned.map(node => node.y)) + LEVEL_HEIGHT : 0) + GROUP_HEADER_HEIGHT;
  let shelfHeight = 0;
  for (const group of groupIndependentSubjects(nodes, edges)) {
    const width = Math.min(columns, group.nodes.length);
    if (shelfX + width > columns) {
      shelfY += shelfHeight;
      shelfX = 0;
      shelfHeight = 0;
    }
    group.nodes.forEach((node, index) => positioned.push({
      id: node.id,
      x: (shelfX + index % width) * SIBLING_WIDTH,
      y: shelfY + Math.floor(index / width) * LEVEL_HEIGHT,
      depth: 0,
    }));
    shelfX += width;
    shelfHeight = Math.max(shelfHeight, Math.ceil(group.nodes.length / width) * LEVEL_HEIGHT + GROUP_HEADER_HEIGHT);
  }
  const positionById = new Map(positioned.map(node => [node.id, node]));
  return nodes.map(node => positionById.get(node.id)!);
}

function centerLayerPositions(
  layers: readonly string[][],
  parents: ReadonlyMap<string, readonly string[]>,
  children: ReadonlyMap<string, readonly string[]>,
  componentSet: ReadonlySet<string>,
) {
  const relativeX = new Map<string, number>();
  for (const layer of layers) layer.forEach((id, i) => relativeX.set(id, i));

  const average = (ids: readonly string[]) => {
    const positions = ids.filter(id => componentSet.has(id)).map(id => relativeX.get(id)).filter((value): value is number => value !== undefined);
    return positions.length === 0 ? undefined : positions.reduce((sum, value) => sum + value, 0) / positions.length;
  };

  const applyLayer = (layer: readonly string[], desiredFor: (id: string) => number) => {
    if (layer.length === 0) return;
    const desired = layer.map(desiredFor);
    const values = [...desired];
    for (let index = 1; index < values.length; index += 1) {
      values[index] = Math.max(values[index]!, values[index - 1]! + 1);
    }
    const shift = (values.reduce((sum, value) => sum + value, 0) - desired.reduce((sum, value) => sum + value, 0)) / values.length;
    layer.forEach((id, index) => relativeX.set(id, values[index]! - shift));
  };

  for (let pass = 0; pass < 6; pass += 1) {
    for (let depth = layers.length - 2; depth >= 0; depth -= 1) {
      applyLayer(layers[depth]!, id => average(children.get(id) ?? []) ?? relativeX.get(id)!);
    }
    for (let depth = 1; depth < layers.length; depth += 1) {
      applyLayer(layers[depth]!, id => average(parents.get(id) ?? []) ?? relativeX.get(id)!);
    }
  }

  return relativeX;
}
