import type { CountrySettings } from '../settings';
import { classify } from './classify';
import { taxYearLabel, taxYearOf, taxYearRange } from './dates';
import { mulDivRound } from './money';
import { convertAtOfficialRate } from './officialRates';
import { selectionKey } from './payers';
import type { Txn } from './types';

export interface EarningsLine {
  currency: string;
  /** Total of the ticked payments, in the currency they were paid in. */
  earned: number;
  count: number;
  isHome: boolean;
  /**
   * Home-currency value. Exact for home-currency payments; for others it is
   * an estimate from PayPal's blended rate, or null when PayPal converted
   * none of that currency in the tax year.
   */
  homeValue: number | null;
  /** How much of this currency PayPal converted in the tax year (net). */
  converted: number;
  /** Home currency PayPal gave for it (net). */
  homeReceived: number;
  /**
   * Home-currency value using the tax authority's published rate for the
   * month each payment arrived. Null when a month has no published rate here.
   */
  officialValue: number | null;
  /** Months ("YYYY-MM") with payments but no published rate. */
  officialMissingMonths: string[];
}

export interface WithdrawalLine {
  currency: string;
  /** Withdrawals minus any that bounced back. */
  amount: number;
  withdrawals: number;
  reversals: number;
}

export interface YearSummary {
  taxYear: number;
  label: string;
  start: string;
  end: string;
  earnings: EarningsLine[];
  /** Sum of the home values that are known. */
  homeTotal: number;
  /** False when some currency has no home value, so the total leaves it out. */
  homeTotalComplete: boolean;
  /** The same two things, at the tax authority's published rates. */
  officialTotal: number;
  officialTotalComplete: boolean;
  withdrawals: WithdrawalLine[];
}

export interface Summary {
  years: YearSummary[];
  /** Conversions that could not be tied to one foreign currency and the home currency. */
  conversionsLeftOut: number;
}

interface YearWork {
  earned: Map<string, { amount: number; count: number; byMonth: Map<string, number> }>;
  converted: Map<string, { foreign: number; home: number }>;
  withdrawn: Map<string, WithdrawalLine>;
}

export function summarise(txns: Txn[], selected: ReadonlySet<string>, s: CountrySettings): Summary {
  const years = new Map<number, YearWork>();
  const yearOf = (txn: Txn): YearWork => {
    const taxYear = taxYearOf(txn.date, s);
    let work = years.get(taxYear);
    if (!work) {
      work = { earned: new Map(), converted: new Map(), withdrawn: new Map() };
      years.set(taxYear, work);
    }
    return work;
  };

  const conversions: Txn[] = [];
  for (const txn of txns) {
    const kind = classify(txn);
    if (kind === 'conversion') {
      conversions.push(txn);
    } else if (kind === 'earning' || kind === 'unknownPositive') {
      if (!selected.has(selectionKey(txn, kind)!)) continue;
      const earned = yearOf(txn).earned;
      const line = earned.get(txn.currency) ?? { amount: 0, count: 0, byMonth: new Map<string, number>() };
      line.amount += txn.gross;
      line.count++;
      const month = txn.date.slice(0, 7);
      line.byMonth.set(month, (line.byMonth.get(month) ?? 0) + txn.gross);
      earned.set(txn.currency, line);
    } else if (kind === 'withdrawal' || kind === 'withdrawalReversal') {
      const withdrawn = yearOf(txn).withdrawn;
      const line = withdrawn.get(txn.currency) ?? { currency: txn.currency, amount: 0, withdrawals: 0, reversals: 0 };
      line.amount -= txn.gross; // withdrawals are negative, reversals positive
      if (kind === 'withdrawal') line.withdrawals++;
      else line.reversals++;
      withdrawn.set(txn.currency, line);
    }
  }

  // The two halves of a conversion (and any reversal of it) share a reference:
  // either they both point at the withdrawal or purchase they paid for, or
  // they point at each other.
  const conversionIds = new Set(conversions.map((t) => t.txnId));
  const groups = new Map<string, Txn[]>();
  for (const txn of conversions) {
    const key =
      txn.refTxnId && conversionIds.has(txn.refTxnId)
        ? [txn.txnId, txn.refTxnId].sort().join('|')
        : txn.refTxnId || txn.txnId;
    groups.set(key, [...(groups.get(key) ?? []), txn]);
  }

  let conversionsLeftOut = 0;
  for (const group of groups.values()) {
    const foreign = new Set(group.filter((t) => t.currency !== s.homeCurrency).map((t) => t.currency));
    const hasHome = group.some((t) => t.currency === s.homeCurrency);
    if (foreign.size !== 1 || !hasHome) {
      conversionsLeftOut++;
      continue;
    }
    const [currency] = foreign;
    for (const txn of group) {
      const converted = yearOf(txn).converted;
      const line = converted.get(currency) ?? { foreign: 0, home: 0 };
      if (txn.currency === s.homeCurrency) line.home += txn.gross;
      else line.foreign -= txn.gross; // foreign currency leaves the balance as a negative
      converted.set(currency, line);
    }
  }

  const result: YearSummary[] = [];
  for (const [taxYear, work] of [...years].sort((a, b) => a[0] - b[0])) {
    if (work.earned.size === 0 && work.withdrawn.size === 0) continue;
    const earnings: EarningsLine[] = [];
    for (const [currency, { amount, count, byMonth }] of work.earned) {
      const isHome = currency === s.homeCurrency;
      let officialValue = 0;
      const officialMissingMonths: string[] = [];
      for (const [month, monthTotal] of byMonth) {
        const value = isHome ? monthTotal : convertAtOfficialRate(monthTotal, currency, month, s.homeCurrency, s.officialRates);
        if (value === null) officialMissingMonths.push(month);
        else officialValue += value;
      }
      const conv = work.converted.get(currency) ?? { foreign: 0, home: 0 };
      const usable = conv.foreign > 0 && conv.home > 0;
      earnings.push({
        currency,
        earned: amount,
        count,
        isHome,
        homeValue: isHome ? amount : usable ? mulDivRound(amount, conv.home, conv.foreign) : null,
        converted: isHome || !usable ? 0 : conv.foreign,
        homeReceived: isHome || !usable ? 0 : conv.home,
        officialValue: officialMissingMonths.length > 0 ? null : officialValue,
        officialMissingMonths: officialMissingMonths.sort(),
      });
    }
    // Home currency first, then alphabetical.
    earnings.sort((a, b) => Number(b.isHome) - Number(a.isHome) || a.currency.localeCompare(b.currency));
    result.push({
      taxYear,
      label: taxYearLabel(taxYear, s),
      ...taxYearRange(taxYear, s),
      earnings,
      homeTotal: earnings.reduce((sum, line) => sum + (line.homeValue ?? 0), 0),
      homeTotalComplete: earnings.every((line) => line.homeValue !== null),
      officialTotal: earnings.reduce((sum, line) => sum + (line.officialValue ?? 0), 0),
      officialTotalComplete: earnings.every((line) => line.officialValue !== null),
      withdrawals: [...work.withdrawn.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    });
  }
  return { years: result, conversionsLeftOut };
}
