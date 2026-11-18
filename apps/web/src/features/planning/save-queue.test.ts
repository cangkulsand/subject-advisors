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
  it('sends each job with the token it was queued with', async () => {
    const seen: (string | undefined)[] = [];
    let release: () => void = () => undefined;
    const queue = new SaveQueue((_changes, version) => { seen.push(version); return new Promise<void>(resolve => { release = resolve; }); }, () => undefined);
    queue.push(change(1), 'v1'); queue.push(change(2), 'v2');
    release(); await tick();
    expect(seen).toEqual(['v1', 'v2']);
  });
  it('dispose drops pending jobs and ignores late status updates', async () => {
    const sent: (SavedChange[] | null)[] = [];
    const statuses: SaveStatus[] = [];
    let release: () => void = () => undefined;
    const queue = new SaveQueue(changes => { sent.push(changes); return new Promise<void>(resolve => { release = resolve; }); }, s => statuses.push(s));
    queue.push(change(1)); queue.push(change(2));
    queue.dispose();
    release(); await tick();
    expect(sent).toEqual([change(1)]);
    expect(statuses).toEqual(['saving']);
    queue.retry(); await tick();
    expect(sent).toEqual([change(1)]);
  });
  it('stops after an error the onError callback swallows, refusing later push and retry', async () => {
    const sent: (SavedChange[] | null)[] = [];
    const statuses: SaveStatus[] = [];
    const queue = new SaveQueue(async changes => { sent.push(changes); throw new Error('stale'); },
      s => statuses.push(s), () => true);
    queue.push(change(1)); queue.push(change(2)); await tick();
    expect(sent).toEqual([change(1)]);
    expect(statuses).toEqual(['saving', 'failed']);
    queue.retry(); queue.push(change(3)); await tick();
    expect(sent).toEqual([change(1)]);
  });
  it('never calls onError or onStatus after dispose, even for an in-flight rejection', async () => {
    const errors: unknown[] = [];
    const statuses: SaveStatus[] = [];
    let rejectSend: (reason: Error) => void = () => undefined;
    const queue = new SaveQueue(() => new Promise<void>((_r, reject) => { rejectSend = reject; }),
      s => statuses.push(s), error => { errors.push(error); return true; });
    queue.push(change(1));
    queue.dispose();
    rejectSend(new Error('late failure'));
    await tick();
    expect(errors).toEqual([]);
    expect(statuses).toEqual(['saving']);
  });
  it('keeps the retry path when onError declines to stop', async () => {
    const statuses: SaveStatus[] = [];
    const queue = new SaveQueue(async () => { throw new Error('offline'); }, s => statuses.push(s), () => false);
    queue.push(change(1)); await tick();
    expect(statuses).toEqual(['saving', 'failed']);
  });
});
