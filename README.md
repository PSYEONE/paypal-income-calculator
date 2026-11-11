# PayPal Income Calculator

A small web page that adds up PayPal earnings and withdrawals per UK tax year (6 April to 5 April).

It is a calculator, not tax advice. It never shows a "tax you owe" figure.

## What it does

1. You add one or more PayPal CSV exports.
2. It lists everyone who paid you, with a payment count and total. You tick the ones that are earnings.
3. It shows earnings per tax year in the currency you were paid in, with two pounds figures side by side: what PayPal gave you, and the value at HMRC's published exchange rates.
4. It shows, separately, the money withdrawn to your card or bank per tax year, to check against a bank statement.

Everything runs in the browser. Files are read in memory and never uploaded or saved. There is no server and no tracking. On Cloudflare Pages, `public/_headers` sets a security policy that blocks the page from making any network requests at all.

## Running it

```
npm install
npm run dev      # open the address it prints
npm test         # run the tests
npm run build    # make the static site in dist/
npm run update-rates   # fetch the latest HMRC monthly rates
```

## Putting it on Cloudflare Pages

- Build command: `npm run build`
- Output folder: `dist`

## The two pounds figures

The tool does not say which one to report. That is for you, HMRC or an accountant.

### What PayPal gave you

PayPal converts foreign currency when you withdraw or spend it, not when you are paid. So for each tax year and currency, the tool adds up all the foreign currency PayPal converted and all the pounds it gave back. That gives PayPal's average rate for the year (its conversion charge included), which is applied to that year's earnings.

- Payments already in pounds are counted as they are.
- If a year has earnings in a currency but PayPal converted none of it that year, the tool says so and gives no estimate.

### At HMRC's rates

Each payment is valued at the exchange rate HMRC publishes for the month it arrived, before any PayPal charge. On real data this comes out a few percent above the PayPal figure, mostly because of PayPal's conversion charge.

- The rates are HMRC's monthly exchange rates from <https://www.trade-tariff.service.gov.uk/exchange_rates>, for the currencies a PayPal balance can hold.
- They are stored in `src/data/hmrc-monthly-rates.json` and built into the site, so the page still makes no network requests.
- They start at January 2021, the earliest month that HMRC service offers.
- **They go stale.** Run `npm run update-rates` each month, then rebuild and redeploy. A payment in a month with no stored rate gets "No figure" rather than a guess.

## Known limits

- **One PayPal layout.** PayPal has more than one CSV export. This reads the one with a `Description` column. Other layouts are refused with a clear message rather than guessed at. To add one, see `src/core/layouts.ts`.
- **Money you refund to a payer is not taken off their total.**
- No fees and no accounts.
- HMRC's yearly average rates are not used, only the monthly ones.
- UK only. Country rules (tax year start, home currency, date order) are in `src/settings.ts`.
- Part-year warnings use the dates in PayPal's file name when present. Otherwise they use the first and last transaction, which can show a gap that is really just a quiet spell.

## Layout of the code

- `src/settings.ts`: country rules.
- `src/data/`: HMRC's rates. `scripts/`: the script that refreshes them.
- `src/core/`: reading files and doing the sums. Plain functions, no browser code.
- `src/ui/`: the page.
- `tests/`: tests, with made-up sample exports in `tests/fixtures/`.

## Real data

Put real exports in `private/`. That folder is in `.gitignore` and must never be committed. If it holds CSV files, `npm test` also checks they can be read (it prints nothing from them).
