import { describe, expect, it } from 'vitest';
import { LEVEL_HEIGHT, NODE_HEIGHT, NODE_WIDTH, SIBLING_WIDTH, groupIndependentSubjects, layoutNodes } from './layout';
import { buildPathwayEdgeRoutes, type PathwayRouteSegment } from './routing';
import type { PathwayGraph } from './contracts';

const graph: PathwayGraph = {
  curriculumId: 1,
  curriculumVersion: '2026',
  programmeName: 'Test',
  demo: false,
  nodes: [
    { id: 'a', subjectCode: 'AAA', subjectName: 'A', creditHours: 3, isCompulsory: true, subjectCategory: null, status: 'REMAINING', grade: null, recognizedCredits: null },
    { id: 'b', subjectCode: 'BBB', subjectName: 'B', creditHours: 3, isCompulsory: true, subjectCategory: null, status: 'LOCKED', grade: null, recognizedCredits: null },
    { id: 'c', subjectCode: 'CCC', subjectName: 'C', creditHours: 3, isCompulsory: true, subjectCategory: null, status: 'LOCKED', grade: null, recognizedCredits: null },
  ],
  edges: [
    { id: 'e1', source: 'a', target: 'b', requirementType: 'MANDATORY' },
    { id: 'e2', source: 'a', target: 'c', requirementType: 'MANDATORY' },
  ],
};

describe('UC17 pathway layout', () => {
  it('places prerequisite roots at depth zero and dependents below them', () => {
    const positioned = layoutNodes(graph.nodes, graph.edges);
    const byId = new Map(positioned.map(node => [node.id, node]));
    expect(byId.get('a')?.depth).toBe(0);
    expect(byId.get('b')?.depth).toBe(1);
    expect(byId.get('c')?.depth).toBe(1);
    expect(byId.get('a')?.y).toBeLessThan(byId.get('b')!.y);
  });

  it('orders same-depth nodes by subject code', () => {
    const positioned = layoutNodes(graph.nodes, graph.edges);
    const depthOne = positioned.filter(node => node.depth === 1);
    expect(depthOne.map(node => node.id)).toEqual(['b', 'c']);
  });

  it('handles an empty graph without throwing', () => {
    expect(layoutNodes([], [])).toEqual([]);
  });

  it('guards against prerequisite cycles', () => {
    const cyclic: PathwayGraph = {
      ...graph,
      edges: [
        { id: 'e1', source: 'a', target: 'b', requirementType: 'MANDATORY' },
        { id: 'e2', source: 'b', target: 'a', requirementType: 'MANDATORY' },
      ],
    };
    const positioned = layoutNodes(cyclic.nodes, cyclic.edges);
    expect(positioned).toHaveLength(3);
    expect(positioned.every(node => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
  });

  it('packs disconnected subjects in compact core and elective groups', () => {
    const nodes = Array.from({ length: 40 }, (_, index) => ({
      ...graph.nodes[0]!, id: `isolated-${index}`, subjectCode: `SUB${String(index).padStart(3, '0')}`,
      subjectCategory: index < 20 ? 'CORE' : 'ELECTIVE E1',
    }));
    const positioned = layoutNodes(nodes, []);
    expect(new Set(positioned.map(node => `${node.x}:${node.y}`)).size).toBe(nodes.length);
    expect(Math.max(...positioned.map(node => node.x))).toBeLessThanOrEqual(5 * SIBLING_WIDTH);
    expect(groupIndependentSubjects(nodes, []).map(group => group.label)).toEqual(['Core subjects', 'Elective subjects']);
    expect(Math.min(...positioned.slice(20).map(node => node.y))).toBeGreaterThan(Math.max(...positioned.slice(0, 20).map(node => node.y)));
  });

  it('keeps independent groups below the flowchart without moving connected subjects', () => {
    const nodes = [...graph.nodes, { ...graph.nodes[0]!, id: 'independent', subjectCode: 'ZZZ' }];
    const positioned = layoutNodes(nodes, graph.edges);
    expect(positioned.find(node => node.id === 'independent')!.y).toBeGreaterThan(Math.max(...positioned.filter(node => node.id !== 'independent').map(node => node.y)));
    expect(positioned.filter(node => node.id !== 'independent')).toEqual(layoutNodes(graph.nodes, graph.edges));
  });

  it('groups only subjects with no valid incident links and reuses configured category aliases', () => {
    const nodes = [
      ...graph.nodes,
      { ...graph.nodes[0]!, id: 'core', subjectCode: 'CORE', subjectCategory: ' programme core ' },
      { ...graph.nodes[0]!, id: 'elective', subjectCode: 'ELEC', subjectCategory: 'elective e1' },
      { ...graph.nodes[0]!, id: 'other', subjectCode: 'OTHER', subjectCategory: null },
      { ...graph.nodes[0]!, id: 'recommended', subjectCode: 'REC', subjectCategory: 'CORE' },
      { ...graph.nodes[0]!, id: 'corequisite', subjectCode: 'CO', subjectCategory: 'ELECTIVE' },
    ];
    const edges = [
      ...graph.edges,
      { id: 'recommended-link', source: 'recommended', target: 'a', requirementType: 'RECOMMENDED' as const },
      { id: 'corequisite-link', source: 'b', target: 'corequisite', requirementType: 'COREQUISITE' as const },
      { id: 'dangling-link', source: 'missing', target: 'core', requirementType: 'MANDATORY' as const },
    ];
    expect(groupIndependentSubjects(nodes, edges).map(group => ({ key: group.key, ids: group.nodes.map(node => node.id) }))).toEqual([
      { key: 'CORE', ids: ['core'] },
      { key: 'ELECTIVE', ids: ['elective'] },
      { key: 'OTHER', ids: ['other'] },
    ]);
  });

  it('does not create independent panels for a fully connected graph or an empty graph', () => {
    expect(groupIndependentSubjects(graph.nodes, graph.edges)).toEqual([]);
    expect(groupIndependentSubjects([], [])).toEqual([]);
  });

  it('does not overlap subject boxes when several small and large independent groups share shelves', () => {
    const nodes = Array.from({ length: 19 }, (_, index) => ({
      ...graph.nodes[0]!, id: String(index), subjectCode: String(index).padStart(3, '0'),
      subjectCategory: index < 2 ? 'CORE' : index < 5 ? 'ELECTIVE' : null,
    }));
    const positioned = layoutNodes(nodes, []);
    for (let a = 0; a < positioned.length; a += 1) {
      for (let b = a + 1; b < positioned.length; b += 1) {
        const left = positioned[a]!;
        const right = positioned[b]!;
        expect(Math.abs(left.x - right.x) >= NODE_WIDTH || Math.abs(left.y - right.y) >= NODE_HEIGHT).toBe(true);
      }
    }
  });

  it('ignores dangling edges without adding phantom nodes or changing valid positions', () => {
    const edges = [...graph.edges, { id: 'dangling', source: 'missing', target: 'b', requirementType: 'MANDATORY' as const }];
    expect(layoutNodes(graph.nodes, edges)).toEqual(layoutNodes(graph.nodes, graph.edges));
    const positioned = layoutNodes(graph.nodes, edges);
    expect(buildPathwayEdgeRoutes(edges, positioned, { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT, levelHeight: LEVEL_HEIGHT }).size).toBe(2);
  });

  it('returns the same positions when acyclic catalogue input order changes', () => {
    const expected = new Map(layoutNodes(graph.nodes, graph.edges).map(node => [node.id, node]));
    const actual = new Map(layoutNodes([...graph.nodes].reverse(), [...graph.edges].reverse()).map(node => [node.id, node]));
    expect(actual).toEqual(expected);
  });

  it('does not create routes for an empty or completely dangling graph', () => {
    expect(buildPathwayEdgeRoutes([], [], { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT, levelHeight: LEVEL_HEIGHT }).size).toBe(0);
    expect(buildPathwayEdgeRoutes(graph.edges, [], { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT, levelHeight: LEVEL_HEIGHT }).size).toBe(0);
  });

  it('uses a nearby free corridor for a skipped-level link rather than the far right of the map', () => {
    const positioned = [
      { id: 'a', x: 0, y: 0, depth: 0 },
      { id: 'b', x: 0, y: LEVEL_HEIGHT, depth: 1 },
      { id: 'c', x: 0, y: 2 * LEVEL_HEIGHT, depth: 2 },
      { id: 'unrelated', x: 2000, y: LEVEL_HEIGHT, depth: 1 },
    ];
    const routes = buildPathwayEdgeRoutes([{ ...graph.edges[0]!, target: 'c' }], positioned, { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT, levelHeight: LEVEL_HEIGHT });
    const route = routes.get('e1')!;
    expect(Math.max(...route.segments.flatMap(segment => [Math.abs(segment.x1), Math.abs(segment.x2)]))).toBeLessThan(200);
    for (const node of positioned) {
      expect(route.segments.some(segment => segmentIntersectsBox(segment, {
        minX: node.x - NODE_WIDTH / 2, maxX: node.x + NODE_WIDTH / 2,
        minY: node.y - NODE_HEIGHT / 2, maxY: node.y + NODE_HEIGHT / 2,
      }))).toBe(false);
    }
    expect(route.segments[0]!.y1).toBe(NODE_HEIGHT / 2);
    expect(route.segments.at(-1)!.y2).toBe(2 * LEVEL_HEIGHT - NODE_HEIGHT / 2);
  });

  it('routes cycles and self-links outside subject boxes without crashing', () => {
    const edges = [
      graph.edges[0]!,
      { id: 'reverse', source: 'b', target: 'a', requirementType: 'COREQUISITE' as const },
      { id: 'self', source: 'a', target: 'a', requirementType: 'RECOMMENDED' as const },
    ];
    const positioned = layoutNodes(graph.nodes, edges);
    const routes = buildPathwayEdgeRoutes(edges, positioned, { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT, levelHeight: LEVEL_HEIGHT });
    expect(routes.size).toBe(edges.length);
    for (const route of routes.values()) {
      for (const node of positioned) {
        expect(route.segments.some(segment => segmentIntersectsBox(segment, {
          minX: node.x - NODE_WIDTH / 2, maxX: node.x + NODE_WIDTH / 2,
          minY: node.y - NODE_HEIGHT / 2, maxY: node.y + NODE_HEIGHT / 2,
        }))).toBe(false);
      }
    }
  });

  it('routes edges through level gaps without crossing node boxes', () => {
    const complex: PathwayGraph = {
      ...graph,
      nodes: [
        { id: 'a', subjectCode: 'AAA', subjectName: 'A', creditHours: 3, isCompulsory: true, subjectCategory: null, status: 'REMAINING', grade: null, recognizedCredits: null },
        { id: 'b', subjectCode: 'BBB', subjectName: 'B', creditHours: 3, isCompulsory: true, subjectCategory: null, status: 'LOCKED', grade: null, recognizedCredits: null },
        { id: 'c', subjectCode: 'CCC', subjectName: 'C', creditHours: 3, isCompulsory: true, subjectCategory: null, status: 'LOCKED', grade: null, recognizedCredits: null },
        { id: 'd', subjectCode: 'DDD', subjectName: 'D', creditHours: 3, isCompulsory: true, subjectCategory: null, status: 'LOCKED', grade: null, recognizedCredits: null },
        { id: 'e', subjectCode: 'EEE', subjectName: 'E', creditHours: 3, isCompulsory: true, subjectCategory: null, status: 'LOCKED', grade: null, recognizedCredits: null },
        { id: 'f', subjectCode: 'FFF', subjectName: 'F', creditHours: 3, isCompulsory: true, subjectCategory: null, status: 'LOCKED', grade: null, recognizedCredits: null },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b', requirementType: 'MANDATORY' },
        { id: 'e2', source: 'a', target: 'c', requirementType: 'MANDATORY' },
        { id: 'e3', source: 'a', target: 'd', requirementType: 'MANDATORY' },
        { id: 'e4', source: 'b', target: 'e', requirementType: 'MANDATORY' },
        { id: 'e5', source: 'c', target: 'e', requirementType: 'MANDATORY' },
        { id: 'e6', source: 'a', target: 'f', requirementType: 'RECOMMENDED' },
      ],
    };
    const positioned = layoutNodes(complex.nodes, complex.edges);
    const routes = buildPathwayEdgeRoutes(complex.edges, positioned, { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT, levelHeight: LEVEL_HEIGHT });
    const boxes = positioned.map(node => ({
      id: node.id,
      minX: node.x - NODE_WIDTH / 2,
      maxX: node.x + NODE_WIDTH / 2,
      minY: node.y - NODE_HEIGHT / 2,
      maxY: node.y + NODE_HEIGHT / 2,
    }));

    for (const route of routes.values()) {
      for (const segment of route.segments) {
        expect(boxes.some(box => segmentIntersectsBox(segment, box))).toBe(false);
      }
    }
  });

  it('assigns separate lanes so routed edges do not share overlapping segments', () => {
    const positioned = layoutNodes(graph.nodes, graph.edges);
    const routes = [...buildPathwayEdgeRoutes(graph.edges, positioned, { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT, levelHeight: LEVEL_HEIGHT }).values()];
    for (let a = 0; a < routes.length; a += 1) {
      for (let b = a + 1; b < routes.length; b += 1) {
        expect(routesHaveOverlappingSegments(routes[a]!.segments, routes[b]!.segments)).toBe(false);
      }
    }
  });

  it('separates opposing departure and arrival ports in the same level gap', () => {
    const positioned = [
      { id: 'a', x: 0, y: 0, depth: 0 },
      { id: 'b', x: SIBLING_WIDTH, y: 0, depth: 0 },
      { id: 'c', x: 0, y: LEVEL_HEIGHT, depth: 1 },
      { id: 'd', x: SIBLING_WIDTH, y: LEVEL_HEIGHT, depth: 1 },
    ];
    const edges = [
      { id: 'cross-a', source: 'a', target: 'd', requirementType: 'MANDATORY' as const },
      { id: 'cross-b', source: 'b', target: 'c', requirementType: 'MANDATORY' as const },
    ];
    const routes = [...buildPathwayEdgeRoutes(edges, positioned, { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT, levelHeight: LEVEL_HEIGHT }).values()];
    expect(routesHaveOverlappingSegments(routes[0]!.segments, routes[1]!.segments)).toBe(false);
  });

  it('keeps every route outside subject boxes in a dense branching curriculum', () => {
    const nodes = Array.from({ length: 36 }, (_, index) => ({
      ...graph.nodes[0]!, id: String(index), subjectCode: `SUB${String(index).padStart(3, '0')}`,
    }));
    const edges = nodes.flatMap((node, index) =>
      [index + 3, index + 5, index + 11].filter(target => target < nodes.length).map(target => ({
        id: `${index}-${target}`, source: node.id, target: String(target), requirementType: 'MANDATORY' as const,
      })));
    const positioned = layoutNodes(nodes, edges);
    const routes = buildPathwayEdgeRoutes(edges, positioned, { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT, levelHeight: LEVEL_HEIGHT });
    expect(routes.size).toBe(edges.length);
    const allRoutes = [...routes.values()];
    for (let a = 0; a < allRoutes.length; a += 1) {
      for (let b = a + 1; b < allRoutes.length; b += 1) {
        expect(routesHaveOverlappingSegments(allRoutes[a]!.segments, allRoutes[b]!.segments)).toBe(false);
      }
    }
    for (const route of routes.values()) {
      for (const node of positioned) {
        expect(route.segments.some(segment => segmentIntersectsBox(segment, {
          minX: node.x - NODE_WIDTH / 2, maxX: node.x + NODE_WIDTH / 2,
          minY: node.y - NODE_HEIGHT / 2, maxY: node.y + NODE_HEIGHT / 2,
        }))).toBe(false);
      }
    }
  });
});

function segmentIntersectsBox(segment: PathwayRouteSegment, box: { minX: number; maxX: number; minY: number; maxY: number }) {
  if (segment.x1 === segment.x2) {
    return segment.x1 > box.minX && segment.x1 < box.maxX && rangesOverlap(segment.y1, segment.y2, box.minY, box.maxY);
  }
  if (segment.y1 === segment.y2) {
    return segment.y1 > box.minY && segment.y1 < box.maxY && rangesOverlap(segment.x1, segment.x2, box.minX, box.maxX);
  }
  return false;
}

function routesHaveOverlappingSegments(a: readonly PathwayRouteSegment[], b: readonly PathwayRouteSegment[]) {
  return a.some(left => b.some(right => segmentsOverlap(left, right)));
}

function segmentsOverlap(a: PathwayRouteSegment, b: PathwayRouteSegment) {
  if (a.x1 === a.x2 && b.x1 === b.x2 && a.x1 === b.x1) {
    return rangesOverlap(a.y1, a.y2, b.y1, b.y2);
  }
  if (a.y1 === a.y2 && b.y1 === b.y2 && a.y1 === b.y1) {
    return rangesOverlap(a.x1, a.x2, b.x1, b.x2);
  }
  return false;
}

function rangesOverlap(a1: number, a2: number, b1: number, b2: number) {
  const minA = Math.min(a1, a2);
  const maxA = Math.max(a1, a2);
  const minB = Math.min(b1, b2);
  const maxB = Math.max(b1, b2);
  return Math.max(minA, minB) < Math.min(maxA, maxB);
}
