// The standalone page at /paypal-csv: how to download a PayPal statement as a
// CSV file. Edit its words here; the steps themselves are in guideText.ts.
//
// The build writes this into paypal-csv.html as plain HTML (see vite.config.ts),
// so the page needs no JavaScript and search engines can read all of it.

import { GUIDE_STEP_TEXT } from './guideText.ts';

export const CSV_PAGE = {
  heading: 'How to download your PayPal statement as a CSV file',
  intro: 'PayPal lets you download your transactions as a file. It takes a few minutes, and you only need a web browser.',
  whatIsCsv: {
    title: 'What is a CSV file?',
    paragraphs: [
      'A CSV file is a simple spreadsheet saved as plain text. Each line is one transaction (the date, who it was from, the amount and so on), with the details separated by commas. CSV stands for "comma-separated values".',
      "Excel, Google Sheets and calculators like this one can all read it. You don't need to open it or change anything in it.",
    ],
  },
  stepsTitle: 'Step by step',
  tipsTitle: 'Tips',
  tips: [
    'Pick dates that cover a whole tax year (6 April to 5 April). One file can cover several years.',
    "Don't open and re-save the file in Excel before using it. That can change the dates and amounts.",
    'You can download more than one file. If their dates overlap, nothing is counted twice.',
    'The right file has a column called "Description". PayPal has another kind of CSV that the calculator can\'t read yet.',
  ],
  cta: {
    title: 'Got your CSV file?',
    text: 'Drop it into the Gig Income calculator to see your PayPal earnings for each tax year.',
    button: 'Go to the income calculator',
  },
};

/** Where the build finds the screenshots. Vite gives each one its final address. */
const PICTURE_DIR = '/src/ui/guide/';

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The page's content as an HTML string, for paypal-csv.html. */
export function csvGuideHtml(): string {
  const p = CSV_PAGE;
  const steps = GUIDE_STEP_TEXT.map((s) => {
    const link = s.link ? ` <a href="${escape(s.link.href)}" target="_blank" rel="noopener noreferrer">${escape(s.link.label)}</a>` : '';
    // Half size: the screenshots were taken on a high-resolution screen.
    const img = s.image
      ? `<img src="${PICTURE_DIR}${escape(s.image.file)}" alt="${escape(s.image.alt)}" width="${Math.round(s.image.width / 2)}" height="${Math.round(s.image.height / 2)}" loading="lazy">`
      : '';
    return `<li><strong>${escape(s.title)}</strong><p>${escape(s.detail)}${link}</p>${img}</li>`;
  }).join('');
  return (
    `<article class="doc">` +
    `<h1>${escape(p.heading)}</h1>` +
    `<p class="lead">${escape(p.intro)}</p>` +
    `<h2>${escape(p.whatIsCsv.title)}</h2>` +
    p.whatIsCsv.paragraphs.map((x) => `<p>${escape(x)}</p>`).join('') +
    `<h2>${escape(p.stepsTitle)}</h2>` +
    `<ol class="guide">${steps}</ol>` +
    `<h2>${escape(p.tipsTitle)}</h2>` +
    `<ul>${p.tips.map((t) => `<li>${escape(t)}</li>`).join('')}</ul>` +
    `<section class="cta"><h2>${escape(p.cta.title)}</h2><p>${escape(p.cta.text)}</p><a class="btn primary" href="/">${escape(p.cta.button)}</a></section>` +
    `</article>`
  );
}
