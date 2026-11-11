import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/core/parse';
import { UK } from '../src/settings';

// Checks any real exports in the gitignored private/ folder can be read.
// Skipped when the folder is empty or missing. Prints nothing from the files.
const dir = new URL('../private/', import.meta.url);
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv')) : [];

describe.skipIf(files.length === 0)('real exports in private/', () => {
  it.each(files.map((_, i) => i))('file %i reads without errors', (i) => {
    const result = parseCsv(readFileSync(new URL(files[i], dir), 'utf8'), files[i], UK);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.rowErrors.length).toBe(0);
      expect(result.file.txns.length).toBeGreaterThan(0);
    }
  });
});
