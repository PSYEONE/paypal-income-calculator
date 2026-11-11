import { minorDigits, mulDivRound } from './money';

/** A tax authority's published monthly exchange rates. */
export interface RateTable {
  /** Who publishes them, for labels. e.g. "HMRC" */
  name: string;
  /** First and last month held, as "YYYY-MM". */
  from: string;
  to: string;
  /** rates[currency]["YYYY-MM"] = units of that currency per 1 unit of home currency, as text. */
  rates: Record<string, Record<string, string>>;
}

/**
 * Values a foreign amount in the home currency at the published rate for one
 * month. Works in whole pence throughout. Returns null when the table has no
 * rate for that currency and month.
 */
export function convertAtOfficialRate(minor: number, currency: string, month: string, home: string, table: RateTable): number | null {
  const text = table.rates[currency]?.[month];
  if (!text) return null;
  const [whole, fraction = ''] = text.split('.');
  const rate = Number(whole + fraction); // the rate with its decimal point removed
  if (!Number.isSafeInteger(rate) || rate <= 0) return null;
  // home = foreign / rate, allowing for each currency's number of decimal places
  return mulDivRound(minor, 10 ** (fraction.length + minorDigits(home)), rate * 10 ** minorDigits(currency));
}
