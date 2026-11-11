import type { ParsedFile, Txn } from './types';

export interface Merged {
  /** Every transaction once, oldest first. */
  txns: Txn[];
  duplicatesRemoved: number;
}

/**
 * Joins several exports into one list.
 *
 * A row that appears in two files (overlapping exports) is kept once. Rows are
 * matched on every field, because a Transaction ID alone is not unique. If one
 * file itself holds the same row twice, both are kept: PayPal put them there.
 */
export function mergeFiles(files: ParsedFile[]): Merged {
  const mostInOneFile = new Map<string, number>();
  for (const file of files) {
    const counts = new Map<string, number>();
    for (const txn of file.txns) counts.set(txn.rowKey, (counts.get(txn.rowKey) ?? 0) + 1);
    for (const [key, count] of counts) {
      mostInOneFile.set(key, Math.max(mostInOneFile.get(key) ?? 0, count));
    }
  }

  const kept = new Map<string, number>();
  const txns: Txn[] = [];
  let total = 0;
  for (const file of files) {
    for (const txn of file.txns) {
      total++;
      const already = kept.get(txn.rowKey) ?? 0;
      if (already >= mostInOneFile.get(txn.rowKey)!) continue;
      kept.set(txn.rowKey, already + 1);
      txns.push(txn);
    }
  }

  // Array sort is stable, so rows with the same date and time keep file order.
  txns.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return { txns, duplicatesRemoved: total - txns.length };
}
