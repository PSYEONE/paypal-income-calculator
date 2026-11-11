// PayPal has more than one CSV layout. Each one we can read is described here.
// To support another, add an entry with its column names.

export interface Layout {
  id: string;
  /** Column names in the file for each thing we need. */
  columns: {
    date: string;
    time: string;
    description: string;
    currency: string;
    gross: string;
    txnId: string;
    email: string;
    name: string;
    refTxnId: string;
  };
}

export const LAYOUTS: Layout[] = [
  {
    id: 'statement',
    columns: {
      date: 'Date',
      time: 'Time',
      description: 'Description',
      currency: 'Currency',
      gross: 'Gross',
      txnId: 'Transaction ID',
      email: 'From Email Address',
      name: 'Name',
      refTxnId: 'Reference Txn ID',
    },
  },
];

export type LayoutMatch =
  | { ok: true; layout: Layout; index: Record<keyof Layout['columns'], number> }
  | { ok: false; error: string };

const norm = (text: string) => text.trim().toLowerCase();

export function detectLayout(header: string[]): LayoutMatch {
  const positions = new Map<string, number>();
  header.forEach((name, i) => {
    if (!positions.has(norm(name))) positions.set(norm(name), i);
  });

  let fewestMissing: string[] | null = null;
  for (const layout of LAYOUTS) {
    const missing = Object.values(layout.columns).filter((name) => !positions.has(norm(name)));
    if (missing.length === 0) {
      const index = Object.fromEntries(
        Object.entries(layout.columns).map(([key, name]) => [key, positions.get(norm(name))!]),
      ) as Record<keyof Layout['columns'], number>;
      return { ok: true, layout, index };
    }
    if (!fewestMissing || missing.length < fewestMissing.length) fewestMissing = missing;
  }

  return {
    ok: false,
    error:
      'This file is not in a PayPal layout this tool can read. ' +
      `It is missing these columns: ${(fewestMissing ?? []).join(', ')}. ` +
      'PayPal has more than one kind of CSV export, and only one is supported so far. Nothing was counted from this file.',
  };
}
