# Gig Income

Live at <https://gigincome.app>. Not connected to or endorsed by PayPal or HMRC.

A small web page that adds up PayPal earnings and withdrawals per UK tax year (6 April to 5 April), per calendar year, or between any two dates you pick.

It is a calculator, not tax advice. It never shows a "tax you owe" figure.

## What it does

1. You add one or more PayPal CSV exports.
2. It lists everyone who paid you, with a payment count and total. You tick the ones that are earnings.
3. It shows earnings in the currency you were paid in, plus what PayPal gave you in your own currency. When that currency is pounds, it also shows the value at HMRC's published exchange rates.
4. It shows, separately, the money withdrawn to your card or bank, to check against a bank statement.

On the results pages you choose:

- **Totals for:** UK tax years, calendar years, or dates you choose. Your dates start as the first and last transaction in your files.
- **Show in:** the currency to convert into. It starts as the currency you withdraw to most often, so someone in Germany who withdraws euros sees euros. HMRC's figures only appear for pounds.

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

## The two converted figures

The tool does not say which one to report. That is for you, HMRC or an accountant.

### What PayPal gave you

PayPal converts foreign currency when you withdraw or spend it, not when you are paid. So for each period (tax year, calendar year or your dates) and currency, the tool adds up all the foreign currency PayPal converted into your chosen currency and everything it gave back. That gives PayPal's average rate for the period (its conversion charge included), which is applied to that period's earnings. This works in any currency.

- Payments already in your chosen currency are counted as they are.
- If a period has earnings in a currency but PayPal converted none of it in that period, the tool says so and gives no estimate. Short custom date ranges hit this more often.

### At HMRC's rates

Each payment is valued at the exchange rate HMRC publishes for the month it arrived, before any PayPal charge. On real data this comes out a few percent above the PayPal figure, mostly because of PayPal's conversion charge.

- The rates are HMRC's monthly exchange rates from <https://www.trade-tariff.service.gov.uk/exchange_rates>, for the currencies a PayPal balance can hold.
- They are stored in `src/data/hmrc-monthly-rates.json` and built into the site, so the page still makes no network requests.
- They start at January 2021, the earliest month that HMRC service offers.
- **They update themselves.** Every Monday a GitHub Action (`.github/workflows/update-rates.yml`) downloads HMRC's rates. If there are new months, it checks none of the old ones went missing (`scripts/check-rates-kept.mjs`), runs the tests and build, and commits the new file to `main`, which redeploys the site. If a run fails, GitHub emails you and nothing is committed. You can also run it by hand from the Actions tab, or locally with `npm run update-rates`.
- A payment in a month with no stored rate gets "No figure" rather than a guess.

## Known limits

- **One PayPal layout, in English.** PayPal has more than one CSV export. This reads the one with a `Description` column. Other layouts are refused with a clear message rather than guessed at. To add one, see `src/core/layouts.ts`. Exports from a PayPal account set to another language have translated column names and transaction types, so they are refused too. Amounts written with a decimal comma (`1.234,56`) and day-first, month-first or year-first dates are all read.
- **Money you refund to a payer is not taken off their total.**
- No fees and no accounts.
- HMRC's yearly average rates are not used, only the monthly ones.
- Official exchange rates are HMRC's only, so they are shown only when converting into pounds. Other countries get the PayPal figure. Tax year presets are the UK's and calendar years; any other tax year can be done with "Dates you choose". Country rules (tax year start, default currency, date order, official rates) are in `src/settings.ts`.
- A period the files only partly cover gets a plain "part year" or "so far" note saying where the count starts or stops. Only a gap between two files is shown as a warning. The dates come from PayPal's file name when present; otherwise from the first and last transaction, which can mistake a quiet spell for a gap.

## Layout of the code

- `src/settings.ts`: country rules.
- `src/data/`: HMRC's rates. `scripts/`: the script that refreshes them.
- `src/core/`: reading files and doing the sums. Plain functions, no browser code.
- `src/ui/`: the page, a step-by-step wizard. The "how to get your files from PayPal" steps are in `src/ui/guide.ts`.
- `tests/`: tests, with made-up sample exports in `tests/fixtures/`.

## Licence

Copyright (C) 2026 PSYEONE. Free software under the GNU Affero General Public License, version 3 only (AGPL-3.0). See `LICENSE`.

You can use, change and share it. If you run a changed copy as a website, you must publish your changed code under the same licence.

## Real data

Put real exports in `private/`. That folder is in `.gitignore` and must never be committed. If it holds CSV files, `npm test` also checks they can be read (it prints nothing from them).
