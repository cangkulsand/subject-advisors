import type { SavedChange } from '../../../../../packages/shared/src/planning/saved';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';
/** `null` clears the saved what-if (Reset to my plan). */
type Value = SavedChange[] | null;

/**
 * Saves the what-if one request at a time (S3-P004-010). While a save runs, newer lists wait and only the latest is
 * sent next, so the server always ends with what the student last saw. A failed save keeps the change on screen.
 */
export class SaveQueue {
  private running = false;
  private pending: { value: Value } | null = null;
  private last: { value: Value } | null = null;

  constructor(private readonly send: (value: Value) => Promise<void>, private readonly onStatus: (status: SaveStatus) => void) {}

  push(value: Value): void {
    this.pending = { value };
    this.last = { value };
    if (!this.running) void this.run();
  }

  /** Sends the latest list again after a failed save. */
  retry(): void {
    if (this.last && !this.running) { this.pending = this.last; void this.run(); }
  }

  private async run(): Promise<void> {
    this.running = true;
    let failed = false;
    while (this.pending) {
      const { value } = this.pending;
      this.pending = null;
      this.onStatus('saving');
      try { await this.send(value); failed = false; } catch { failed = true; }
    }
    this.running = false;
    this.onStatus(failed ? 'failed' : 'saved');
  }
}
