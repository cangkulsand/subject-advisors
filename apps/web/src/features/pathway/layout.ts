import type { PathwayPrerequisiteEdge, PathwaySubjectNode } from './contracts';

export interface PositionedNode {
  id: string;
  x: number;
  y: number;
  depth: number;
}

export const COLUMN_WIDTH = 240;
export const ROW_HEIGHT = 132;

/**
 * Layered left-to-right layout for the prerequisite talent tree. Depth is the
 * longest mandatory/recommended prerequisite chain from a root subject. Cycles
 * are guarded defensively even though the database rejects mandatory cycles.
 */
export function layoutNodes(
  nodes: readonly PathwaySubjectNode[],
  edges: readonly PathwayPrerequisiteEdge[],
): PositionedNode[] {
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    const list = incoming.get(edge.target) ?? [];
    list.push(edge.source);
    incoming.set(edge.target, list);
  }

  const depthCache = new Map<string, number>();
  const depthOf = (id: string, visiting: Set<string>): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const sources = incoming.get(id) ?? [];
    const depth = sources.length === 0 ? 0 : 1 + Math.max(...sources.map(source => depthOf(source, visiting)));
    visiting.delete(id);
    depthCache.set(id, depth);
    return depth;
  };

  const byDepth = new Map<number, string[]>();
  for (const node of nodes) {
    const depth = depthOf(node.id, new Set());
    const list = byDepth.get(depth) ?? [];
    list.push(node.id);
    byDepth.set(depth, list);
  }

  const codeById = new Map(nodes.map(node => [node.id, node.subjectCode]));
  for (const list of byDepth.values()) {
    list.sort((a, b) => (codeById.get(a) ?? '').localeCompare(codeById.get(b) ?? ''));
  }

  const positioned: PositionedNode[] = [];
  for (const [depth, ids] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
    const totalHeight = (ids.length - 1) * ROW_HEIGHT;
    ids.forEach((id, index) => {
      positioned.push({ id, x: depth * COLUMN_WIDTH, y: index * ROW_HEIGHT - totalHeight / 2, depth });
    });
  }
  return positioned;
}
