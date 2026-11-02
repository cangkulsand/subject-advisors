/** Canonical JSON: object keys sorted, undefined dropped. Deterministic for equal values. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    if (record[key] !== undefined) parts.push(`${JSON.stringify(key)}:${stableStringify(record[key])}`);
  }
  return `{${parts.join(',')}}`;
}

function cyrb53(text: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Non-cryptographic 112-bit fingerprint for change detection only (not security). */
export function fingerprint(value: unknown): string {
  const text = stableStringify(value);
  return `fp1:${cyrb53(text, 1)}${cyrb53(text, 2)}`;
}
