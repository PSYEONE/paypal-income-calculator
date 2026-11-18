// Run after update-hmrc-rates.mjs, before saving its result. Compares the new
// rates file with the last committed one and fails if anything went missing,
// so a hiccup on HMRC's side can never quietly delete months of rates.
//
// Run with: node scripts/check-rates-kept.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATH = 'src/data/hmrc-monthly-rates.json';
const before = JSON.parse(execFileSync('git', ['show', `HEAD:${PATH}`], { encoding: 'utf8' }));
const after = JSON.parse(readFileSync(PATH, 'utf8'));

const problems = [];
if (after.from > before.from) problems.push(`now starts at ${after.from}, was ${before.from}`);
if (after.to < before.to) problems.push(`now ends at ${after.to}, was ${before.to}`);
const changed = [];
for (const [currency, months] of Object.entries(before.rates)) {
  for (const [month, rate] of Object.entries(months)) {
    const now = after.rates[currency]?.[month];
    if (now === undefined) problems.push(`${currency} ${month} has gone`);
    else if (now !== rate) changed.push(`${currency} ${month}: ${rate} -> ${now}`);
  }
}

// HMRC sometimes corrects a published rate. That is allowed, but shown in the log.
if (changed.length) console.log('Rates HMRC changed:\n' + changed.join('\n'));
if (problems.length) {
  console.error('Not saving the new rates, because some were lost:\n' + problems.join('\n'));
  process.exit(1);
}
console.log(before.to === after.to ? `No new months (still up to ${after.to}).` : `New rates up to ${after.to} (were up to ${before.to}).`);
