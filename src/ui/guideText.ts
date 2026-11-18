// The "how to get your files from PayPal" steps. Edit the steps here.
//
// Used in two places: step 2 of the app (guide.ts adds the pictures) and the
// standalone page at /paypal-csv (csvGuide.ts), which the build writes as
// plain HTML so search engines can read it.
//
// The screenshots in ./guide/ are PayPal's own pages with private details
// painted over and the thing to click outlined. They are shown at half their
// pixel size so they stay sharp on high-resolution screens.

export interface GuideStepText {
  title: string;
  detail: string;
  /** A link shown after the detail text. Opens in a new tab. */
  link?: { href: string; label: string };
  /** A screenshot in ./guide/. Width and height are the picture's real size in pixels. */
  image?: { file: string; alt: string; width: number; height: number };
}

export const GUIDE_INTRO =
  'You need a statement from PayPal saved as a CSV file. It takes a few minutes. If you already have one, skip ahead.';

export const GUIDE_STEP_TEXT: GuideStepText[] = [
  {
    title: "Open PayPal's reports page",
    detail: 'Go to this address and log in if PayPal asks you to:',
    link: { href: 'https://www.paypal.com/reports/', label: 'paypal.com/reports' },
  },
  {
    title: 'Choose "Statements - monthly and custom"',
    detail: 'On the All reports page, make sure the Payments tab is selected. Then click "Statements - monthly and custom".',
    image: { file: 'reports-list.png', alt: 'PayPal\'s All reports page, with the Payments tab and the "Statements - monthly and custom" link outlined.', width: 1708, height: 945 },
  },
  {
    title: 'Click Create Report',
    detail: 'The button is at the top right of the Statements page.',
    image: { file: 'create-report.png', alt: 'The Statements page, with the Create Report button outlined.', width: 1716, height: 348 },
  },
  {
    title: 'Pick CSV and your dates',
    detail:
      'Set File format to CSV. Under Date range, choose dates that cover everything you want to add up, such as a whole tax year (in the UK, 6 April to 5 April). One report can cover several years, and you can narrow the dates down later in the calculator.',
    image: { file: 'format-and-dates.png', alt: 'The report form, with File format set to CSV and the Date range box outlined.', width: 793, height: 269 },
  },
  {
    title: 'Wait for Ready, then click Download',
    detail:
      'Your report appears in a list on the same page. When its status says Ready, click Download and save the file. Do not open and re-save it in a spreadsheet program first, because that can change the dates and amounts.',
    image: { file: 'download.png', alt: 'The list of reports, with the Ready status and the Download link outlined.', width: 1568, height: 211 },
  },
];

export const GUIDE_TIPS: string[] = [
  'You can add more than one file here. If their dates overlap, each payment is still counted once.',
  'PayPal has more than one kind of CSV. The right one has a column called Description. If you add the other kind, this tool will tell you.',
];
