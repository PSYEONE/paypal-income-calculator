// Downloads HMRC's published monthly exchange rates and saves the ones PayPal
// can hold into src/data/hmrc-monthly-rates.json, so the site can use them
// without making any network requests.
//
// Run with: npm run update-rates   (then rebuild and redeploy)
import { writeFileSync } from 'node:fs';

const SOURCE = 'https://www.trade-tariff.service.gov.uk/exchange_rates';
const fileUrl = (year, month) =>
  `https://www.trade-tariff.service.gov.uk/api/v2/exchange_rates/files/monthly_csv_${year}-${month}.csv`;
const FIRST = { year: 2021, month: 1 }; // earliest month this HMRC service offers

// Currencies a PayPal balance can be held in.
const CURRENCIES = ['AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'HKD', 'HUF', 'ILS', 'JPY', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'SEK', 'SGD', 'THB', 'TWD', 'USD'];

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

const rates = Object.fromEntries(CURRENCIES.map((c) => [c, {}]));
const now = new Date();
// HMRC publishes next month's rates a little early, so try one month ahead.
const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
let latest = null;
const problems = [];

for (let d = new Date(Date.UTC(FIRST.year, FIRST.month - 1, 1)); d <= last; d.setUTCMonth(d.getUTCMonth() + 1)) {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const response = await fetch(fileUrl(year, month));
  if (response.status === 404) continue;
  if (!response.ok) throw new Error(`${key}: HMRC answered ${response.status}`);

  const lines = (await response.text()).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const codeAt = header.findIndex((h) => h === 'currency code');
  const rateAt = header.findIndex((h) => h.startsWith('currency units per'));
  if (codeAt < 0 || rateAt < 0) throw new Error(`${key}: unexpected columns: ${lines[0]}`);

  const seen = {};
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const code = cells[codeAt];
    const rate = cells[rateAt];
    if (!CURRENCIES.includes(code)) continue;
    if (!/^\d+(\.\d+)?$/.test(rate) || Number(rate) <= 0) throw new Error(`${key} ${code}: bad rate "${rate}"`);
    if (seen[code] && seen[code] !== rate) problems.push(`${key} ${code}: two different rates (${seen[code]} and ${rate})`);
    seen[code] ??= rate;
  }
  for (const code of CURRENCIES) {
    if (seen[code]) rates[code][key] = seen[code];
    else problems.push(`${key}: no rate for ${code}`);
  }
  latest = key;
}

if (!latest) throw new Error('No rates downloaded.');
if (problems.length) console.warn('Check these:\n' + problems.join('\n'));

const out = {
  about: 'HMRC monthly exchange rates: units of foreign currency per 1 GBP. Made by scripts/update-hmrc-rates.mjs. Do not edit by hand.',
  source: SOURCE,
  from: `${FIRST.year}-${String(FIRST.month).padStart(2, '0')}`,
  to: latest,
  rates,
};
writeFileSync(new URL('../src/data/hmrc-monthly-rates.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`Saved rates for ${CURRENCIES.length} currencies, ${out.from} to ${out.to}.`);
