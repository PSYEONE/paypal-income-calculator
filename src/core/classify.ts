import type { Txn } from './types';

// PayPal's own wording for each kind of row, from the Description column.
// All matching is done in lower case.

/** Money that may be earnings, when the amount is positive. */
export const EARNING_TYPES = ['mass pay payment', 'mobile payment', 'general payment'];

export const CONVERSION_TYPES = ['general currency conversion', 'user initiated currency conversion'];

/** Money sent out to a card or bank. */
export const WITHDRAWAL_TYPES = ['general card withdrawal', 'user initiated withdrawal'];

/** A withdrawal that bounced back. */
export const WITHDRAWAL_REVERSAL_TYPES = ['reversal of ach withdrawal transaction'];

/** Positive amounts that are known not to be income. */
export const NOT_INCOME_TYPES = [
  'general card deposit',
  'bank deposit to pp account',
  'payment refund',
  'reversal of general account hold',
];

export type Kind =
  | 'earning' // goes in the payer list
  | 'unknownPositive' // money in of a type we don't recognise; the user decides
  | 'conversion'
  | 'withdrawal'
  | 'withdrawalReversal'
  | 'ignored';

export function classify(txn: Txn): Kind {
  const type = txn.description.trim().toLowerCase();
  if (CONVERSION_TYPES.includes(type)) return 'conversion';
  if (WITHDRAWAL_TYPES.includes(type)) return 'withdrawal';
  if (WITHDRAWAL_REVERSAL_TYPES.includes(type)) return 'withdrawalReversal';
  if (txn.gross <= 0) return 'ignored'; // money out, holds, purchases
  if (EARNING_TYPES.includes(type)) return 'earning';
  if (NOT_INCOME_TYPES.includes(type)) return 'ignored';
  return 'unknownPositive';
}
