import { describe, expect, it } from 'vitest';
import { layoutNodes } from './layout';
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
  it('places prerequisite roots at depth zero and dependents to the right', () => {
    const positioned = layoutNodes(graph.nodes, graph.edges);
    const byId = new Map(positioned.map(node => [node.id, node]));
    expect(byId.get('a')?.depth).toBe(0);
    expect(byId.get('b')?.depth).toBe(1);
    expect(byId.get('c')?.depth).toBe(1);
    expect(byId.get('a')?.x).toBeLessThan(byId.get('b')!.x);
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
  });
});
