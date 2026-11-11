import { describe, expect, it } from 'vitest';
import { classify } from '../src/core/classify';
import { mergeFiles } from '../src/core/merge';
import { parseCsv } from '../src/core/parse';
import { buildPayers } from '../src/core/payers';
import { UK } from '../src/settings';
import { fixtureText, loadFixture, txn } from './helpers';

const HEADER =
  'Date,Time,Time Zone,Description,Currency,Gross,Fee,Net,Balance,Transaction ID,From Email Address,Name,Bank Name,Bank account,Postage and Packaging Amount,VAT,Invoice ID,Reference Txn ID';
const row = (date: string, gross: string, id = 'A1') =>
  `${date},10:00:00,Europe/London,Mobile Payment,GBP,"${gross}",0.00,"${gross}",50.00,${id},a@example.com,A,,,0.00,0.00,,`;

describe('parseCsv', () => {
  it('reads the sample export, byte order mark and all', () => {
    expect(fixtureText('sample-a.csv').charCodeAt(0)).toBe(0xfeff);
    const file = loadFixture('sample-a.csv');
    expect(file.layoutId).toBe('statement');
    expect(file.txns).toHaveLength(35);
    expect(file.rowErrors).toEqual([]);
    expect(file.warnings).toEqual([]);

    const big = file.txns.find((t) => t.txnId === 'TU002')!;
    expect(big).toMatchObject({ date: '2024-04-10', currency: 'USD', gross: 135742, description: 'Mass Pay Payment' });
    expect(file.txns.find((t) => t.txnId === 'TC001')!.gross).toBe(-100000);
  });

  it('stops with a clear message on a layout it does not know', () => {
    const result = parseCsv(fixtureText('other-layout.csv'), 'other.csv', UK);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not in a PayPal layout');
      expect(result.error).toContain('Description');
      expect(result.error).toContain('Transaction ID');
    }
  });

  it('stops on an empty file', () => {
    expect(parseCsv('', 'empty.csv', UK).ok).toBe(false);
  });

  it('detects month-first dates instead of assuming UK order', () => {
    const result = parseCsv([HEADER, row('01/31/2024', '10.00'), row('02/01/2024', '5.00', 'A2')].join('\n'), 'us.csv', UK);
    expect(result.ok && result.file.txns.map((t) => t.date)).toEqual(['2024-01-31', '2024-02-01']);
  });

  it('warns when the dates could be read either way', () => {
    const result = parseCsv([HEADER, row('01/02/2024', '10.00')].join('\n'), 'x.csv', UK);
    expect(result.ok && result.file.txns[0].date).toBe('2024-02-01');
    expect(result.ok && result.file.warnings[0]).toContain('day/month');
  });

  it('reports rows it cannot read instead of dropping them quietly', () => {
    const text = [HEADER, row('31/01/2024', '10.00'), row('31/01/2024', 'ten pounds', 'A2'), 'too,short', row('32/01/2024', '1.00', 'A4')].join('\r\n');
    const result = parseCsv(text, 'x.csv', UK);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.txns).toHaveLength(1);
      expect(result.file.rowErrors.map((e) => e.row)).toEqual([3, 4, 5]);
    }
  });
});

describe('mergeFiles', () => {
  it('removes rows repeated across overlapping files and sorts by date', () => {
    const a = loadFixture('sample-a.csv');
    const b = loadFixture('sample-b.csv');
    expect(b.txns).toHaveLength(20);
    const merged = mergeFiles([a, b]);
    expect(merged.txns).toHaveLength(40);
    expect(merged.duplicatesRemoved).toBe(15);
    const dates = merged.txns.map((t) => t.date);
    expect(dates).toEqual([...dates].sort());
    expect(dates[0]).toBe('2024-03-10');
    expect(dates[dates.length - 1]).toBe('2025-05-10');
  });

  it('gives the same answer whichever file comes first, or if one is loaded twice', () => {
    const a = loadFixture('sample-a.csv');
    const b = loadFixture('sample-b.csv');
    expect(mergeFiles([b, a, b]).txns.map((t) => t.rowKey)).toEqual(mergeFiles([a, b]).txns.map((t) => t.rowKey));
  });

  it('keeps a withdrawal and its reversal even though they share a Transaction ID', () => {
    const merged = mergeFiles([loadFixture('sample-a.csv'), loadFixture('sample-b.csv')]);
    expect(merged.txns.filter((t) => t.txnId === 'TW003').map((t) => t.gross)).toEqual([-30000, 30000]);
  });

  it('keeps a row that one file holds twice', () => {
    const twice = { fileName: 'a', layoutId: 'statement', warnings: [], rowErrors: [], txns: [txn({ rowKey: 'same' }), txn({ rowKey: 'same' })] };
    const once = { ...twice, fileName: 'b', txns: [txn({ rowKey: 'same' })] };
    expect(mergeFiles([twice, once]).txns).toHaveLength(2);
  });
});

describe('classify', () => {
  it('sorts each kind of row', () => {
    expect(classify(txn({ description: 'Mass Pay Payment', gross: 100 }))).toBe('earning');
    expect(classify(txn({ description: 'Mobile Payment', gross: -100 }))).toBe('ignored');
    expect(classify(txn({ description: 'General Card Deposit', gross: 100 }))).toBe('ignored');
    expect(classify(txn({ description: 'Bank Deposit to PP Account', gross: 100 }))).toBe('ignored');
    expect(classify(txn({ description: 'Payment Refund', gross: 100 }))).toBe('ignored');
    expect(classify(txn({ description: 'General Hold', gross: -100 }))).toBe('ignored');
    expect(classify(txn({ description: 'Reversal of General Account Hold', gross: 100 }))).toBe('ignored');
    expect(classify(txn({ description: 'General Currency Conversion', gross: 100 }))).toBe('conversion');
    expect(classify(txn({ description: 'User Initiated Currency Conversion', gross: -100 }))).toBe('conversion');
    expect(classify(txn({ description: 'General Card Withdrawal', gross: -100 }))).toBe('withdrawal');
    expect(classify(txn({ description: 'User Initiated Withdrawal', gross: -100 }))).toBe('withdrawal');
    expect(classify(txn({ description: 'Reversal of ACH Withdrawal Transaction', gross: 100 }))).toBe('withdrawalReversal');
    expect(classify(txn({ description: 'Other', gross: 100 }))).toBe('unknownPositive');
    expect(classify(txn({ description: 'Other', gross: -100 }))).toBe('ignored');
  });
});

describe('buildPayers', () => {
  const merged = mergeFiles([loadFixture('sample-a.csv'), loadFixture('sample-b.csv')]);
  const { payers, unknown } = buildPayers(merged.txns);

  it('lists payers only from the three earning types, biggest first', () => {
    expect(payers.map((p) => p.label)).toEqual(['Fake Platform Inc', 'Sam Fakename', 'Riverside Fake Studio', 'Euro Client GmbH']);
  });

  it('groups one email under several names', () => {
    const sam = payers.find((p) => p.email === 'sam@example.com')!;
    expect(sam.names).toEqual(['Sam Fakename', 'S. Fakename Ltd']);
    expect(sam.count).toBe(3); // the payment sent to someone else is not counted
    expect(sam.totals).toEqual({ GBP: 23000 });
  });

  it('falls back to the name when there is no email', () => {
    const studio = payers.find((p) => p.label === 'Riverside Fake Studio')!;
    expect(studio.key).toBe('payer|name:riverside fake studio');
    expect(studio.totals).toEqual({ GBP: 20000 });
  });

  it('totals per currency', () => {
    expect(payers[0]).toMatchObject({ count: 6, totals: { USD: 291000 }, types: ['Mass Pay Payment'] });
  });

  it('flags unknown money in that just pays for a purchase of the same amount', () => {
    const lists = buildPayers([
      txn({ description: 'Website Payment', gross: -1474, name: 'Pretend Subscription', txnId: 'BUY1' }),
      txn({ description: 'Other', gross: 1474, name: 'Pretend Subscription', refTxnId: 'BUY1' }),
      txn({ description: 'Other', gross: 900, name: 'Someone Else', refTxnId: 'BUY1' }),
      txn({ description: 'Mobile Payment', gross: 1474, name: 'A Payer', refTxnId: 'BUY1' }),
    ]);
    expect(lists.unknown.map((u) => [u.label, u.matchesPurchase])).toEqual([
      ['Pretend Subscription', true],
      ['Someone Else', false],
    ]);
    expect(lists.payers[0].matchesPurchase).toBe(false);
  });

  it('shows unknown positive types separately', () => {
    expect(unknown.map((u) => [u.types[0], u.label, u.totals])).toEqual([
      ['Mystery Credit', 'Odd Co', { USD: 2000 }],
      ['Other', '(no name given)', { GBP: 1500 }],
    ]);
  });
});
