import type { SavedChange } from '../../../../../packages/shared/src/planning/saved';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';
/** `null` clears the saved what-if (Reset to my plan). */
type Value = SavedChange[] | null;
interface Job { value: Value; baselineVersion?: string }

/**
 * Saves the what-if one request at a time (S3-P004-010). While a save runs, newer lists wait and only the latest is
 * sent next, so the server always ends with what the student last saw. A failed save keeps the change on screen.
 */
export class SaveQueue {
  private running = false;
  private pending: Job | null = null;
  private last: Job | null = null;
  private disposed = false;
  private halted = false;

  constructor(
    private readonly send: (value: Value, baselineVersion?: string) => Promise<void>,
    private readonly onStatus: (status: SaveStatus) => void,
    private readonly onError?: (error: unknown) => boolean,
  ) {}

  push(value: Value, baselineVersion?: string): void {
    if (this.disposed || this.halted) return;
    const job = { value, baselineVersion };
    this.pending = job;
    this.last = job;
    if (!this.running) void this.run();
  }

  /** Sends the latest list again after a failed save. */
  retry(): void {
    if (this.disposed || this.halted || !this.last || this.running) return;
    this.pending = this.last;
    void this.run();
  }

  dispose(): void {
    this.disposed = true;
    this.pending = null;
    this.last = null;
  }

  private status(status: SaveStatus): void {
    if (!this.disposed) this.onStatus(status);
  }

  private async run(): Promise<void> {
    this.running = true;
    let failed = false;
    while (this.pending) {
      const job = this.pending;
      this.pending = null;
      this.status('saving');
      try { await this.send(job.value, job.baselineVersion); failed = false; }
      catch (error) {
        failed = true;
        if (!this.disposed && this.onError && this.onError(error)) { this.pending = null; this.last = null; this.halted = true; }
      }
    }
    this.running = false;
    this.status(failed ? 'failed' : 'saved');
  }
}
