// The welcome page's words and the common questions under it. Edit them here.
//
// They are used twice: the app draws them with the DOM (welcomeNodes), and the
// build writes the same thing into index.html as plain HTML (welcomeHtml), so
// search engines can read the page without running JavaScript.
// tests/app.test.ts checks the two always say the same.

import { settings } from '../settings.ts';

/** A run of text: plain, bold, or a link that opens in a new tab. */
export type Inline = string | { strong: string } | { text: string; href: string };

export interface Question {
  q: string;
  a: Inline[];
}

const authority = settings.officialRates.name;

export const WELCOME = {
  title: 'Gig Income',
  /** What it is, in the words people search for. Shown under the name. */
  tagline: 'PayPal income calculator for Self Assessment',
  intro:
    'Drop in your PayPal statements and it adds up your earnings for you, for each tax year or for any dates you choose. ' +
    'Useful for freelancers and side income, and for checking figures before your Self Assessment.',
  youGet: [
    [{ strong: 'your earnings' }, ', in the currency you were paid in'],
    [`the same earnings in your own currency, at PayPal's rate (and at ${authority}'s, for pounds)`],
    ['what you withdrew to your card or bank, to check against your statement'],
  ] as Inline[][],
  privacy: 'Your files are read on this device only. Nothing is uploaded, sent or saved anywhere.',
};

export const QUESTIONS_TITLE = 'Common questions';

/** Shared by every question, so opening one closes whichever was open (no JavaScript needed). */
export const QUESTION_GROUP = 'faq';

export const QUESTIONS: Question[] = [
  {
    q: 'What does this calculator do?',
    a: [
      'It reads the statement files you download from PayPal and adds up the money people sent you, for each tax year or for any dates you choose. ' +
        'You tick which payers count as earnings. It also shows what you withdrew to your card or bank, so you can check it against your bank statements.',
    ],
  },
  {
    q: 'Is my PayPal data uploaded anywhere?',
    a: [
      "No. Your files are read inside your browser, on your own device. Nothing is uploaded, sent or saved, and the page is set up so it can't connect to anything else on the internet once it has loaded. " +
        'The code is public on GitHub ',
      { text: 'here', href: 'https://github.com/PSYEONE/paypal-income-calculator' },
      '.',
    ],
  },
  {
    q: 'Which payments count as income?',
    a: [
      'You decide. The calculator lists everyone who sent you money, and you tick the ones that were payment for work. ' +
        "Money from friends or family, refunds, transfers in from your bank and currency conversions aren't counted.",
    ],
  },
  {
    q: `Do I need to tell ${authority} about my PayPal income?`,
    a: [
      `It depends on your situation. ${authority} has a £1,000 trading allowance: if your total income from self-employment or side work is £1,000 or less in a tax year, before expenses, you may not need to tell ${authority} about it. ` +
        "This calculator shows your earnings for each tax year so you can check. If you're over, or unsure, see ",
      { text: `${authority}'s guidance on the trading allowance`, href: 'https://www.gov.uk/guidance/tax-free-allowances-on-property-and-trading-income' },
      '.',
    ],
  },
  {
    q: 'What is the UK tax year?',
    a: [
      'It runs from 6 April to 5 April the next year. The 2024-25 tax year, for example, is 6 April 2024 to 5 April 2025. ' +
        'The calculator can also total by calendar year, or between any two dates.',
    ],
  },
  {
    q: 'Why are there two figures in pounds?',
    a: [
      "If you were paid in another currency, there's more than one fair way to turn it into pounds. " +
        `One figure is the pounds PayPal actually gave you when it converted your money. The other values each payment at ${authority}'s official exchange rate for the month you were paid.`,
    ],
  },
  {
    q: 'How do I convert US dollars to pounds for my tax return?',
    a: [
      `Choose pounds under "Show in" on the results page. It's picked for you if you withdraw to a UK bank. ` +
        `The calculator then shows your dollar earnings two ways: the pounds PayPal actually gave you, and their value at ${authority}'s exchange rate for each month you were paid. ` +
        'Euros and other currencies work the same way.',
    ],
  },
  {
    q: `Why is PayPal's figure lower than ${authority}'s?`,
    a: [
      'PayPal adds a fee when it converts currency, usually around 3 to 4%, built into its exchange rate. ' +
        `${authority}'s rates have no fee in them, so they usually come out a little higher.`,
    ],
  },
  {
    q: 'Which exchange rate should I use for my tax return?',
    a: [
      `This calculator doesn't decide that for you. ${authority} asks for a reasonable rate, used consistently from year to year. ` +
        `Its own published rates are a common choice. If you're unsure, check ${authority}'s guidance or ask an accountant.`,
    ],
  },
  {
    q: "Does it take off PayPal's fees?",
    a: ["No. It counts the full amount each person sent you, before PayPal's fees. It doesn't work out expenses."],
  },
  {
    q: 'Can I use it outside the UK?',
    a: [
      'Yes. It works in any currency, and starts with the one you withdraw to most often. You can total by calendar year or any dates you choose. ' +
        `${authority}'s rates only appear when you're working in pounds.`,
    ],
  },
  {
    q: 'Is it free?',
    a: ["Yes. There's no sign-up, and the code is open source."],
  },
  {
    q: 'How do I get my PayPal statement as a CSV file?',
    a: [
      'Log in to PayPal and go to paypal.com/reports. Choose "Statements - monthly and custom", click Create Report, set the format to CSV and pick your dates. ' +
        'When the report says Ready, download it. The calculator walks you through each step with pictures.',
    ],
  },
];

const LINK_ATTRS = 'target="_blank" rel="noopener noreferrer"';

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inlineHtml(parts: Inline[]): string {
  return parts
    .map((p) =>
      typeof p === 'string' ? escape(p) : 'strong' in p ? `<strong>${escape(p.strong)}</strong>` : `<a href="${escape(p.href)}" ${LINK_ATTRS}>${escape(p.text)}</a>`,
    )
    .join('');
}

/** The welcome page as an HTML string, for index.html. */
export function welcomeHtml(): string {
  const items = WELCOME.youGet.map((li) => `<li>${inlineHtml(li)}</li>`).join('');
  const questions = QUESTIONS.map((x) => `<details name="${QUESTION_GROUP}"><summary>${escape(x.q)}</summary><p>${inlineHtml(x.a)}</p></details>`).join('');
  return (
    `<div class="wiz-body">` +
    `<div class="hero"><h1><img class="logo" src="/favicon.svg" alt="" width="40" height="40">${escape(WELCOME.title)}</h1><p class="tagline">${escape(WELCOME.tagline)}</p><p>${escape(WELCOME.intro)}</p><p>You get:</p><ul>${items}</ul><p>${escape(WELCOME.privacy)}</p></div>` +
    `<section class="faq"><h2>${escape(QUESTIONS_TITLE)}</h2>${questions}</section>` +
    `</div>`
  );
}
