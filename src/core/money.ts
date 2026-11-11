// Money is held as whole minor units (pence, cents). Amounts are read from
// text digit by digit, so no fractions ever creep in.

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'HUF', 'TWD']);

export function minorDigits(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

/** "1,357.42" -> 135742. Returns null if the text is not a plain amount. */
export function parseAmount(text: string, currency: string): number | null {
  const cleaned = text.replace(/[,\s]/g, '');
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

/** How many units of `home` one unit of `foreign` bought. For display only. */
export function displayRate(foreignMinor: number, foreign: string, homeMinor: number, home: string): number {
  return (homeMinor / 10 ** minorDigits(home)) / (foreignMinor / 10 ** minorDigits(foreign));
}
