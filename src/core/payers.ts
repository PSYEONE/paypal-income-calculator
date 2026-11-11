import { classify, type Kind } from './classify';
import type { Txn } from './types';

export interface PayerGroup {
  /** What the tick box stores. */
  key: string;
  /** Best name to show. */
  label: string;
  email: string;
  /** Every name seen for this payer. */
  names: string[];
  /** PayPal's descriptions for these payments. */
  types: string[];
  count: number;
  /** Total per currency, in pence or cents. */
  totals: Record<string, number>;
  /**
   * True when every row here points at a purchase of exactly the same amount.
   * That is PayPal moving money in to pay for the purchase, not income.
   */
  matchesPurchase: boolean;
}

function payerId(txn: Txn): string {
  if (txn.email) return `email:${txn.email.toLowerCase()}`;
  if (txn.name) return `name:${txn.name.toLowerCase()}`;
  return 'nobody';
}

/**
 * The tick-box key a transaction belongs to, or null if it is not something
 * the user chooses. Payers are grouped by email, or by name when there is no
 * email. Unrecognised types are kept apart, by type and then payer.
 */
export function selectionKey(txn: Txn, kind: Kind = classify(txn)): string | null {
  if (kind === 'earning') return `payer|${payerId(txn)}`;
  if (kind === 'unknownPositive') return `other|${txn.description.toLowerCase()}|${payerId(txn)}`;
  return null;
}

export interface PayerLists {
  /** From the three known earning types. */
  payers: PayerGroup[];
  /** Money in of a type this tool does not recognise. */
  unknown: PayerGroup[];
}

export function buildPayers(txns: Txn[]): PayerLists {
  const byId = new Map<string, Txn[]>();
  for (const txn of txns) byId.set(txn.txnId, [...(byId.get(txn.txnId) ?? []), txn]);
  const paysForPurchase = (txn: Txn) =>
    (byId.get(txn.refTxnId) ?? []).some((other) => other.currency === txn.currency && other.gross === -txn.gross);

  const groups = new Map<string, PayerGroup & { kind: Kind }>();
  for (const txn of txns) {
    const kind = classify(txn);
    const key = selectionKey(txn, kind);
    if (!key) continue;
    let group = groups.get(key);
    if (!group) {
      group = { key, kind, label: '', email: txn.email.toLowerCase(), names: [], types: [], count: 0, totals: {}, matchesPurchase: kind === 'unknownPositive' };
      groups.set(key, group);
    }
    if (txn.name && !group.names.includes(txn.name)) group.names.push(txn.name);
    if (!group.types.includes(txn.description)) group.types.push(txn.description);
    if (group.matchesPurchase && !paysForPurchase(txn)) group.matchesPurchase = false;
    group.count++;
    group.totals[txn.currency] = (group.totals[txn.currency] ?? 0) + txn.gross;
  }

  const size = (g: PayerGroup) => Object.values(g.totals).reduce((a, b) => a + b, 0);
  const lists: PayerLists = { payers: [], unknown: [] };
  for (const { kind, ...group } of groups.values()) {
    group.label = group.names[0] ?? (group.email || '(no name given)');
    (kind === 'earning' ? lists.payers : lists.unknown).push(group);
  }
  for (const list of [lists.payers, lists.unknown]) {
    list.sort((a, b) => size(b) - size(a) || a.label.localeCompare(b.label));
  }
  return lists;
}
