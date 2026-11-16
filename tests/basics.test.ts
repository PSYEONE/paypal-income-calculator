import { describe, expect, it } from 'vitest';
import { addDays, detectDateOrder, parseDate } from '../src/core/dates';
import { detectDecimalMark, formatMoney, formatRate, mulDivRound, parseAmount } from '../src/core/money';
import { periodOf, periodsTouching, yearLabel, yearOf, yearRange } from '../src/core/periods';
import { UK } from '../src/settings';

describe('money', () => {
  it('reads amounts as whole pence without floats', () => {
    expect(parseAmount('1,357.42', 'USD')).toBe(135742);
    expect(parseAmount('-5.00', 'GBP')).toBe(-500);
    expect(parseAmount('0.07', 'GBP')).toBe(7);
    expect(parseAmount('12', 'GBP')).toBe(1200);
    expect(parseAmount('12.5', 'GBP')).toBe(1250);
    expect(parseAmount('1,234,567.89', 'GBP')).toBe(123456789);
  });

  it('handles currencies with no pence', () => {
    expect(parseAmount('1,500', 'JPY')).toBe(1500);
    expect(parseAmount('1,500.00', 'JPY')).toBe(1500);
  });

  it('refuses things that are not plain amounts', () => {
    expect(parseAmount('', 'GBP')).toBeNull();
    expect(parseAmount('abc', 'GBP')).toBeNull();
    expect(parseAmount('1.2.3', 'GBP')).toBeNull();
    expect(parseAmount('1.005', 'GBP')).toBeNull();
  });

  it('reads amounts written with a decimal comma', () => {
    expect(parseAmount('1.357,42', 'EUR', ',')).toBe(135742);
    expect(parseAmount('-5,00', 'EUR', ',')).toBe(-500);
    expect(parseAmount('1 234,56', 'EUR', ',')).toBe(123456);
    expect(parseAmount('1.500', 'JPY', ',')).toBe(1500);
    expect(parseAmount('1,005', 'EUR', ',')).toBeNull();
  });

  it('works out which decimal mark a file uses', () => {
    expect(detectDecimalMark([{ text: '1,357.42', currency: 'USD' }])).toBe('.');
    expect(detectDecimalMark([{ text: '1.357,42', currency: 'EUR' }, { text: '1.500', currency: 'JPY' }])).toBe(',');
    expect(detectDecimalMark([])).toBe('.');
    expect(() => detectDecimalMark([{ text: '5.00', currency: 'USD' }, { text: '5,00', currency: 'EUR' }])).toThrow();
  });

  it('multiplies and divides with whole-number rounding', () => {
    expect(mulDivRound(210000, 126800, 160000)).toBe(166425);
    expect(mulDivRound(1, 1, 2)).toBe(1); // 0.5 rounds up
    expect(mulDivRound(-1, 1, 2)).toBe(-1);
    expect(mulDivRound(1, 1, 3)).toBe(0);
    expect(mulDivRound(9007199254740991, 100, 100)).toBe(9007199254740991);
  });

  it('shows an exchange rate at a glance', () => {
    expect(formatRate(0.7628, 'USD', 'GBP', 'en-GB')).toBe('US$1 = £0.7628');
    expect(formatRate(0.005, 'JPY', 'GBP', 'en-GB')).toBe('JP¥1 = £0.0050');
  });

  it('formats for display', () => {
    expect(formatMoney(135742, 'GBP', 'en-GB')).toBe('£1,357.42');
    expect(formatMoney(-500, 'USD', 'en-GB')).toBe('-US$5.00');
  });
});

describe('dates', () => {
  it('detects day-first, month-first and year-first files', () => {
    expect(detectDateOrder(['01/02/2024', '31/01/2024'], 'MDY')).toEqual({ order: 'DMY', guessed: false });
    expect(detectDateOrder(['01/02/2024', '01/31/2024'], 'DMY')).toEqual({ order: 'MDY', guessed: false });
    expect(detectDateOrder(['2024-01-31'], 'DMY')).toEqual({ order: 'YMD', guessed: false });
  });

  it('falls back to the country default when every date is ambiguous, and says so', () => {
    expect(detectDateOrder(['01/02/2024', '03/04/2024'], 'DMY')).toEqual({ order: 'DMY', guessed: true });
  });

  it('refuses a file that mixes formats', () => {
    expect(() => detectDateOrder(['31/01/2024', '01/31/2024'], 'DMY')).toThrow();
  });

  it('parses and validates dates', () => {
    expect(parseDate('05/04/2024', 'DMY')).toBe('2024-04-05');
    expect(parseDate('05/04/2024', 'MDY')).toBe('2024-05-04');
    expect(parseDate('31/02/2024', 'DMY')).toBeNull();
    expect(parseDate('29/02/2024', 'DMY')).toBe('2024-02-29');
    expect(parseDate('not a date', 'DMY')).toBeNull();
  });

  it('puts 5 April and 6 April in different UK tax years', () => {
    const tax = UK.taxYearStart;
    expect(yearOf('2024-04-05', tax)).toBe(2023);
    expect(yearOf('2024-04-06', tax)).toBe(2024);
    expect(yearOf('2025-01-01', tax)).toBe(2024);
    expect(yearLabel(2024, tax)).toBe('2024-25');
    expect(yearLabel(1999, tax)).toBe('1999-00');
    expect(yearRange(2024, tax)).toEqual({ start: '2024-04-06', end: '2025-04-05' });
  });

  it('does calendar years too', () => {
    const jan = { month: 1, day: 1 };
    expect(yearOf('2024-12-31', jan)).toBe(2024);
    expect(yearLabel(2024, jan)).toBe('2024');
    expect(yearRange(2024, jan)).toEqual({ start: '2024-01-01', end: '2024-12-31' });
  });

  it('puts dates inside picked dates in one period, and the rest in none', () => {
    const rule = { kind: 'range' as const, start: '2024-03-01', end: '2024-08-31' };
    expect(periodOf('2024-03-01', rule)).toEqual({ key: 'range', label: 'Your dates', start: '2024-03-01', end: '2024-08-31' });
    expect(periodOf('2024-08-31', rule)?.key).toBe('range');
    expect(periodOf('2024-02-29', rule)).toBeNull();
    expect(periodOf('2024-09-01', rule)).toBeNull();
    expect(periodsTouching('2020-01-01', '2020-02-01', rule).map((p) => p.key)).toEqual(['range']);
  });

  it('steps across month ends', () => {
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(addDays('2024-01-01', -1)).toBe('2023-12-31');
  });
});
