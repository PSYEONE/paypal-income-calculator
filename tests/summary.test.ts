import { describe, expect, it } from 'vitest';
import { checkCoverage, fileRange } from '../src/core/coverage';
import { mergeFiles } from '../src/core/merge';
import { buildPayers } from '../src/core/payers';
import { summarise } from '../src/core/summary';
import { defaultReport, UK } from '../src/settings';
import { loadFixture, txn } from './helpers';

const report = defaultReport(UK);
const merged = mergeFiles([loadFixture('sample-a.csv'), loadFixture('sample-b.csv')]);
const lists = buildPayers(merged.txns);
const allPayers = new Set(lists.payers.map((p) => p.key));
const keyOf = (label: string) => [...lists.payers, ...lists.unknown].find((p) => p.label === label)!.key;

describe('summarise: earnings', () => {
  const { periods: years, conversionsLeftOut } = summarise(merged.txns, allPayers, report);
  const year = (label: string) => years.find((y) => y.label === label)!;

  it('splits by UK tax year', () => {
    expect(years.map((y) => y.label)).toEqual(['2023-24', '2024-25', '2025-26']);
    expect(year('2024-25')).toMatchObject({ start: '2024-04-06', end: '2025-04-05' });
    expect(conversionsLeftOut).toBe(0);
  });

  it('says so, and does not guess, when a year has earnings but no conversions', () => {
    const y = year('2023-24');
    expect(y.earnings).toMatchObject([
      { currency: 'GBP', earned: 5000, count: 1, isHome: true, homeValue: 5000, converted: 0, homeReceived: 0 },
      { currency: 'USD', earned: 51000, count: 2, isHome: false, homeValue: null, converted: 0, homeReceived: 0 },
    ]);
    expect(y.homeTotal).toBe(5000);
    expect(y.homeTotalComplete).toBe(false);
  });

  it("applies PayPal's blended rate for the year, netting reversed and backwards conversions", () => {
    const y = year('2024-25');
    // Converted: 1000 + 500 + 380 - 380 (reversed) - 100 (GBP to USD) + 200 = $1,600
    // Received:  790 + 400 + 300 - 300 - 80 + 158 = £1,268, so $2,100 earned -> £1,664.25
    expect(y.earnings).toMatchObject([
      { currency: 'GBP', earned: 32000, count: 2, isHome: true, homeValue: 32000, converted: 0, homeReceived: 0 },
      { currency: 'EUR', earned: 7500, count: 1, isHome: false, homeValue: null, converted: 0, homeReceived: 0 },
      { currency: 'USD', earned: 210000, count: 3, isHome: false, homeValue: 166425, converted: 160000, homeReceived: 126800 },
    ]);
    expect(y.homeTotalComplete).toBe(false); // EUR has no rate
    expect(y.homeTotal).toBe(32000 + 166425);
  });

  it('uses each year’s own rate', () => {
    const y = year('2025-26');
    expect(y.earnings.find((e) => e.currency === 'USD')).toMatchObject({ earned: 30000, homeValue: 23100 });
    expect(y.homeTotal).toBe(6000 + 23100);
    expect(y.homeTotalComplete).toBe(true);
  });

  it('counts only ticked payers', () => {
    const only = summarise(merged.txns, new Set([keyOf('Sam Fakename')]), report);
    expect(only.periods.map((y) => [y.label, y.earnings.map((e) => [e.currency, e.earned])])).toEqual([
      ['2023-24', [['GBP', 5000]]],
      ['2024-25', [['GBP', 12000]]],
      ['2025-26', [['GBP', 6000]]],
    ]);
  });

  it('counts an unknown type once the user ticks it', () => {
    const withMystery = summarise(merged.txns, new Set([keyOf('Fake Platform Inc'), keyOf('Odd Co')]), report);
    const usd = withMystery.periods.find((y) => y.label === '2024-25')!.earnings[0];
    expect(usd).toMatchObject({ currency: 'USD', earned: 212000, count: 4 });
  });

  it('never counts deposits, refunds, holds or conversions as earnings', () => {
    const everything = new Set([...lists.payers, ...lists.unknown].map((p) => p.key));
    const total = summarise(merged.txns, everything, report).periods.flatMap((y) => y.earnings).reduce((sum, e) => sum + e.count, 0);
    expect(total).toBe(11 + 2); // 11 payments from payers, 2 unknown
  });
});

describe('summarise: published rates', () => {
  // Made-up rates: units of foreign currency per £1.
  const fake = { name: 'TEST', base: 'GBP', from: '2024-05', to: '2024-07', rates: { USD: { '2024-05': '1.25', '2024-06': '1.6', '2024-07': '2' }, JPY: { '2024-05': '200' } } };
  const s = { ...report, officialRates: fake };
  const pay = (currency: string, gross: number, date: string) => txn({ description: 'Mass Pay Payment', currency, gross, date, email: 'p@example.com' });
  const ticked = new Set(['payer|email:p@example.com']);

  it('values each payment at the rate for the month it arrived', () => {
    const { periods: years } = summarise([pay('USD', 100000, '2024-05-03'), pay('USD', 50000, '2024-05-20'), pay('USD', 80000, '2024-06-01'), pay('GBP', 1000, '2024-06-02')], ticked, s);
    // $1,500 / 1.25 = £1,200 and $800 / 1.6 = £500
    expect(years[0].earnings).toMatchObject([
      { currency: 'GBP', officialValue: 1000 },
      { currency: 'USD', officialValue: 170000, officialMissingMonths: [], homeValue: null },
    ]);
    expect(years[0]).toMatchObject({ officialTotal: 171000, officialTotalComplete: true, homeTotalComplete: false });
  });

  it('allows for currencies with no pence', () => {
    const { periods: years } = summarise([pay('JPY', 30000, '2024-05-03')], ticked, s); // ¥30,000 / 200 = £150
    expect(years[0].earnings[0].officialValue).toBe(15000);
  });

  it('gives no figure, and names the month, when a rate is missing', () => {
    const { periods: years } = summarise([pay('USD', 100000, '2024-07-03'), pay('USD', 100000, '2024-08-03'), pay('EUR', 5000, '2024-05-03')], ticked, s);
    expect(years[0].earnings).toMatchObject([
      { currency: 'EUR', officialValue: null, officialMissingMonths: ['2024-05'] },
      { currency: 'USD', officialValue: null, officialMissingMonths: ['2024-08'] },
    ]);
    expect(years[0]).toMatchObject({ officialTotal: 0, officialTotalComplete: false });
  });

  it('uses the payment month even for 1 to 5 April, which belong to the earlier tax year', () => {
    const real = summarise([pay('USD', 127070, '2025-01-15')], ticked, report); // HMRC January 2025: 1.2707
    expect(real.periods[0].earnings[0].officialValue).toBe(100000);
  });
});

describe('summarise: withdrawals', () => {
  it('totals withdrawals per tax year, minus reversals, even with nothing ticked', () => {
    const { periods: years } = summarise(merged.txns, new Set(), report);
    expect(years.map((y) => [y.label, y.withdrawals])).toEqual([
      ['2024-25', [{ currency: 'GBP', amount: 119000, withdrawals: 3, reversals: 1 }]],
      ['2025-26', [{ currency: 'GBP', amount: 23100, withdrawals: 1, reversals: 0 }]],
    ]);
  });
});

describe('summarise: conversions', () => {
  it('pairs user-initiated conversions that point at each other', () => {
    const txns = [
      txn({ description: 'Mass Pay Payment', currency: 'USD', gross: 10000, email: 'p@example.com' }),
      txn({ description: 'User Initiated Currency Conversion', currency: 'USD', gross: -10000, txnId: 'A', refTxnId: 'B' }),
      txn({ description: 'User Initiated Currency Conversion', currency: 'GBP', gross: 8000, txnId: 'B', refTxnId: 'A' }),
    ];
    const { periods: years } = summarise(txns, new Set(['payer|email:p@example.com']), report);
    expect(years[0].earnings[0].homeValue).toBe(8000);
  });

  it('keeps each currency’s pounds apart when two are converted in one year', () => {
    const conv = (currency: string, gross: number, ref: string) => txn({ description: 'General Currency Conversion', currency, gross, refTxnId: ref });
    const txns = [
      txn({ description: 'Mass Pay Payment', currency: 'USD', gross: 10000, email: 'p@example.com' }),
      txn({ description: 'Mass Pay Payment', currency: 'EUR', gross: 10000, email: 'p@example.com' }),
      conv('USD', -10000, 'W1'),
      conv('GBP', 8000, 'W1'),
      conv('EUR', -10000, 'W2'),
      conv('GBP', 8500, 'W2'),
    ];
    const { periods: years } = summarise(txns, new Set(['payer|email:p@example.com']), report);
    expect(years[0].earnings.map((e) => [e.currency, e.homeValue])).toEqual([['EUR', 8500], ['USD', 8000]]);
  });

  it('leaves out, and counts, a conversion it cannot tie to one currency', () => {
    const txns = [txn({ description: 'General Currency Conversion', currency: 'USD', gross: -10000, refTxnId: 'W9' })];
    expect(summarise(txns, new Set(), report).conversionsLeftOut).toBe(1);
  });
});

describe('coverage', () => {
  const some = [txn({ date: '2024-02-02' }), txn({ date: '2026-07-21' })];

  it('reads the export dates from a PayPal file name', () => {
    expect(fileRange('ABC123-CSR-20240131000000-20260727115959-20260727054226.csv', some)).toEqual({
      start: '2024-01-31',
      end: '2026-07-27',
      source: 'filename',
    });
  });

  it('falls back to first and last transaction', () => {
    expect(fileRange('Download.csv', some)).toEqual({ start: '2024-02-02', end: '2026-07-21', source: 'rows' });
    expect(fileRange('X-20250101000000-20250201000000.csv', some)?.source).toBe('rows'); // name does not fit the rows
    expect(fileRange('Download.csv', [])).toBeNull();
  });

  it('tells apart a late start, an early stop and a tax year still running', () => {
    const { periods, approximate } = checkCoverage([{ start: '2024-01-31', end: '2026-07-27', source: 'filename' }], report.period, '2026-11-11');
    expect(approximate).toBe(false);
    expect(periods.map(({ label, complete, gaps, inProgress }) => ({ label, complete, gaps, inProgress }))).toEqual([
      { label: '2023-24', complete: false, gaps: [{ start: '2023-04-06', end: '2024-01-30', kind: 'before' }], inProgress: false },
      { label: '2024-25', complete: true, gaps: [], inProgress: false },
      { label: '2025-26', complete: true, gaps: [], inProgress: false },
      { label: '2026-27', complete: false, gaps: [{ start: '2026-07-28', end: '2027-04-05', kind: 'after' }], inProgress: true },
    ]);
  });

  it('joins files that touch and finds a hole between files that do not', () => {
    const touching = checkCoverage(
      [
        { start: '2024-10-01', end: '2025-04-05', source: 'filename' },
        { start: '2024-04-06', end: '2024-09-30', source: 'filename' },
      ],
      report.period,
    );
    expect(touching.periods).toMatchObject([{ key: '2024', label: '2024-25', complete: true, gaps: [], inProgress: false }]);

    const holed = checkCoverage(
      [
        { start: '2024-04-06', end: '2024-08-31', source: 'rows' },
        { start: '2024-10-01', end: '2025-04-05', source: 'rows' },
      ],
      report.period,
    );
    expect(holed.approximate).toBe(true);
    expect(holed.periods[0].gaps).toEqual([{ start: '2024-09-01', end: '2024-09-30', kind: 'between' }]);
  });
});
