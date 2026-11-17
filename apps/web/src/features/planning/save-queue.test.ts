import { describe, expect, it } from 'vitest';
import type { SavedChange } from '../../../../../packages/shared/src/planning/saved';
import { SaveQueue, type SaveStatus } from './save-queue';

const change = (id: number): SavedChange[] => [{ kind: 'POSTPONE', curriculumSubjectId: id }];
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('SaveQueue', () => {
  it('runs one save at a time and then sends only the latest list', async () => {
    const sent: (SavedChange[] | null)[] = [];
    let release: () => void = () => undefined;
    const queue = new SaveQueue(changes => { sent.push(changes); return new Promise<void>(resolve => { release = resolve; }); }, () => undefined);
    queue.push(change(1)); queue.push(change(2)); queue.push(change(3));
    expect(sent).toEqual([change(1)]);
    release(); await tick();
    expect(sent).toEqual([change(1), change(3)]);
    release(); await tick();
    expect(sent).toHaveLength(2);
  });
  it('reports a failed save and retries the latest list', async () => {
    const statuses: SaveStatus[] = [];
    let fail = true;
    const sent: (SavedChange[] | null)[] = [];
    const queue = new SaveQueue(async changes => { sent.push(changes); if (fail) throw new Error('offline'); }, s => statuses.push(s));
    queue.push(null); await tick();
    expect(statuses).toEqual(['saving', 'failed']);
    fail = false; queue.retry(); await tick();
    expect(statuses).toEqual(['saving', 'failed', 'saving', 'saved']);
    expect(sent).toEqual([null, null]);
  });
});
