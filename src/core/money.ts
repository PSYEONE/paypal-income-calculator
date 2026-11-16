// Money is held as whole minor units (pence, cents). Amounts are read from
// text digit by digit, so no fractions ever creep in.

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'HUF', 'TWD']);

export function minorDigits(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

/** The character that separates whole units from pence or cents. */
export type DecimalMark = '.' | ',';

/**
 * Works out whether a file writes amounts as "1,357.42" or "1.357,42" by
 * looking at the last three characters of amounts in currencies that have
 * pence or cents (PayPal always writes two decimal places for those). Throws
 * if the file uses both.
 */
export function detectDecimalMark(samples: { text: string; currency: string }[]): DecimalMark {
  let dots = 0;
  let commas = 0;
  for (const { text, currency } of samples) {
    if (minorDigits(currency) !== 2) continue;
    const mark = /\d([.,])\d{2}$/.exec(text.trim())?.[1];
    if (mark === '.') dots++;
    else if (mark === ',') commas++;
  }
  if (dots > 0 && commas > 0) throw new Error('The amounts in this file are written in more than one format.');
  return commas > 0 ? ',' : '.';
}

/**
 * "1,357.42" -> 135742, or with a decimal comma, "1.357,42" -> 135742.
 * Returns null if the text is not a plain amount.
 */
export function parseAmount(text: string, currency: string, mark: DecimalMark = '.'): number | null {
  const thousands = mark === '.' ? /[,\s]/g : /[.\s]/g;
  const cleaned = text.replace(thousands, '').replace(',', '.');
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) return null;
  const digits = minorDigits(currency);
  const fraction = match[3] ?? '';
  // More decimal places than the currency has is only fine if they are zeros.
  if (fraction.length > digits && /[1-9]/.test(fraction.slice(digits))) return null;
  const minorText = match[2] + fraction.slice(0, digits).padEnd(digits, '0');
  const value = Number(minorText);
  if (!Number.isSafeInteger(value)) return null;
  return match[1] === '-' ? -value : value;
}

/** a * b / c in whole numbers, rounded half away from zero. */
export function mulDivRound(a: number, b: number, c: number): number {
  if (c === 0) throw new Error('Cannot divide by zero');
  const numerator = BigInt(a) * BigInt(b);
  const divisor = BigInt(c);
  const negative = numerator < 0n !== divisor < 0n;
  const absN = numerator < 0n ? -numerator : numerator;
  const absD = divisor < 0n ? -divisor : divisor;
  const rounded = (absN * 2n + absD) / (absD * 2n);
  return Number(negative ? -rounded : rounded);
}

/** For display only. */
export function formatMoney(minor: number, currency: string, locale: string): string {
  const digits = minorDigits(currency);
  const value = minor / 10 ** digits;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(digits)}`;
  }
}

/** "US$1 = £0.7628": an exchange rate at a glance. For display only. */
export function formatRate(rate: number, foreign: string, home: string, locale: string): string {
  try {
    const one = new Intl.NumberFormat(locale, { style: 'currency', currency: foreign, maximumFractionDigits: 0 }).format(1);
    const worth = new Intl.NumberFormat(locale, { style: 'currency', currency: home, minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(rate);
    return `${one} = ${worth}`;
  } catch {
    return `1 ${foreign} = ${rate.toFixed(4)} ${home}`;
  }
}

/** How many units of `home` one unit of `foreign` bought. For display only. */
export function displayRate(foreignMinor: number, foreign: string, homeMinor: number, home: string): number {
  return (homeMinor / 10 ** minorDigits(home)) / (foreignMinor / 10 ** minorDigits(foreign));
}
