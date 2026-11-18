import { classify } from '../core/classify';
import { checkCoverage, fileRange, type DateRange, type FileRange, type PeriodCoverage } from '../core/coverage';
import { addDays, formatDate, formatMonth } from '../core/dates';
import { mergeFiles } from '../core/merge';
import { displayRate, formatMoney, formatRate } from '../core/money';
import { parseCsv } from '../core/parse';
import { buildPayers, type PayerGroup } from '../core/payers';
import type { PeriodRule, YearStart } from '../core/periods';
import { summarise, type EarningsLine, type PeriodSummary, type ReportOptions } from '../core/summary';
import type { ParsedFile, Txn } from '../core/types';
import { settings } from '../settings';
import { h } from './dom';
import { GUIDE_INTRO, GUIDE_STEPS, GUIDE_TIPS } from './guide';

/** The pages of the wizard, in order. The welcome page is not a numbered step. */
const STEPS = [
  { id: 'welcome', title: 'Gig Income' },
  { id: 'guide', title: 'Get your files from PayPal' },
  { id: 'files', title: 'Add your PayPal files' },
  { id: 'payers', title: 'Tick who paid you for work' },
  { id: 'earnings', title: 'Earnings by tax year' },
  { id: 'withdrawals', title: 'Money withdrawn to your card or bank' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];

/** How the totals are split up. */
export type PeriodChoice = 'tax' | 'calendar' | 'custom';

/** The words that change with the period choice. */
const PERIOD_WORDS: Record<PeriodChoice, { title: string; column: string; within: string; notOver: string; tag: string }> = {
  tax: { title: 'Earnings by tax year', column: 'Tax year', within: 'this tax year', notOver: 'This tax year is not over yet.', tag: 'part year' },
  calendar: { title: 'Earnings by year', column: 'Year', within: 'this year', notOver: 'This year is not over yet.', tag: 'part year' },
  custom: { title: 'Earnings for your dates', column: 'Dates', within: 'between these dates', notOver: 'Your dates run past today.', tag: 'partly covered' },
};

interface State {
  step: StepId;
  files: ParsedFile[];
  failures: { fileName: string; error: string }[];
  /** Tick-box keys of the payers the user counts as earnings. */
  selected: Set<string>;
  /** Null until the person picks: tax years for pounds, calendar years for any other currency. */
  period: PeriodChoice | null;
  /** Picked dates for a custom period; null means "from the first / to the last transaction". */
  customStart: string | null;
  customEnd: string | null;
  /** Currency to show converted figures in; null means "work it out from the files". */
  home: string | null;
}

/** Everything about how the totals are being shown right now. */
interface Report {
  options: ReportOptions;
  /** Every currency in the files, for the "Show in" choice. */
  currencies: string[];
  choice: PeriodChoice;
  words: (typeof PERIOD_WORDS)[PeriodChoice];
  /** Why the picked dates can't be used, if they can't. */
  invalid: string | null;
  /** First and last transaction in the files. */
  span: DateRange | null;
}

const money = (minor: number, currency: string) => formatMoney(minor, currency, settings.locale);
const day = (iso: string) => formatDate(iso, settings.locale);
const span = (range: DateRange) => (range.start === range.end ? day(range.start) : `${day(range.start)} to ${day(range.end)}`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** "6 Apr to 5 Apr" for a year starting on 6 April. */
function yearSpan(start: YearStart): string {
  const f = new Intl.DateTimeFormat(settings.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${f.format(Date.UTC(2001, start.month - 1, start.day))} to ${f.format(Date.UTC(2001, start.month - 1, start.day - 1))}`;
}

/** "pounds", "US dollars", "euros": a currency's name in a sentence. */
function currencyWords(code: string): string {
  if (code === 'GBP') return 'pounds';
  try {
    const part = new Intl.NumberFormat(settings.locale, { style: 'currency', currency: code, currencyDisplay: 'name' })
      .formatToParts(2)
      .find((p) => p.type === 'currency');
    if (part) return part.value;
  } catch {
    // Unknown currency code: fall back to the code itself.
  }
  return code;
}
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The currency someone most likely lives in: the one they withdraw to their
 * bank most often. Falls back to the country's own currency.
 */
function likelyHome(txns: Txn[], currencies: string[]): string {
  const counts = new Map<string, number>();
  for (const txn of txns) if (classify(txn) === 'withdrawal') counts.set(txn.currency, (counts.get(txn.currency) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || Number(b[0] === settings.homeCurrency) - Number(a[0] === settings.homeCurrency));
  if (ranked.length > 0) return ranked[0][0];
  return currencies.includes(settings.homeCurrency) || currencies.length === 0 ? settings.homeCurrency : currencies[0];
}

/** Lets a wide table scroll sideways on a narrow screen. */
const scroll = (table: HTMLElement) => h('div', { class: 'table-wrap' }, table);

/**
 * A button that needs two clicks. The first turns it red and changes its
 * label; the second runs the action. Moving away from it cancels.
 */
function confirmButton(label: string, confirmLabel: string, action: () => void): HTMLButtonElement {
  const shown = h('span', null, label);
  // The hidden copy of the longer label keeps the button one width.
  const widest = h('span', { 'aria-hidden': 'true' }, confirmLabel.length > label.length ? confirmLabel : label);
  const button = h('button', { type: 'button', title: label }, h('span', { class: 'swap' }, widest, shown));
  const arm = (armed: boolean) => {
    button.classList.toggle('armed', armed);
    shown.textContent = armed ? confirmLabel : label;
    button.title = armed ? `Click again to ${label.toLowerCase()}` : label;
  };
  button.addEventListener('click', () => {
    if (button.classList.contains('armed')) action();
    else arm(true);
  });
  button.addEventListener('mouseleave', () => arm(false));
  button.addEventListener('blur', () => arm(false));
  return button;
}

/** Donation pages, the same ones interviewr-ai uses. */
const SUPPORT_LINKS = [
  { label: 'GitHub Sponsors', href: 'https://github.com/sponsors/PSYEONE' },
  { label: 'Crypto', href: 'https://nowpayments.io/donation/psyeone' },
];
const FEEDBACK_URL = 'https://github.com/PSYEONE/paypal-income-calculator/issues/new';

/** A small heart, drawn inline so the page needs nothing from outside. */
function heart(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'heart');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute(
    'd',
    'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  );
  svg.append(path);
  return svg;
}

/**
 * A quiet ask under the results: donation links if it helped, a feedback link
 * if it did not. It is part of the page, not a pop-up, and never gets in the way.
 */
function supportCard(): HTMLElement {
  const link = (label: string, href: string, primary: boolean) =>
    h('a', { class: primary ? 'btn primary' : 'btn', href, target: '_blank', rel: 'noopener noreferrer' }, label);
  return h(
    'div',
    { class: 'support' },
    heart(),
    h('div', null,
      h('strong', null, 'Did this help?'),
      h('p', null, "This tool is free. If it saved you time, a donation would be greatly appreciated <3"),
      h('div', { class: 'support-links' }, SUPPORT_LINKS.map((l) => link(l.label, l.href, true))),
      h('p', { class: 'small' }, 'Something wrong or missing? ', h('a', { href: FEEDBACK_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Tell me on GitHub'), '.'),
    ),
  );
}

/** Today's date on this device, as "YYYY-MM-DD". */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function createApp(root: HTMLElement, today: string = todayIso()) {
  const state: State = { step: 'welcome', files: [], failures: [], selected: new Set(), period: null, customStart: null, customEnd: null, home: null };

  // Every page has the same three parts: a title, a scrolling middle, and buttons pinned at the bottom.
  const head = h('div', { class: 'wiz-head' });
  const body = h('div', { class: 'wiz-body' });
  const foot = h('div', { class: 'wiz-foot' });
  root.classList.add('wizard');
  root.replaceChildren(head, body, foot);

  /** Everything worked out from the loaded files. */
  function work() {
    const merged = mergeFiles(state.files);
    const ranges = new Map<string, FileRange | null>(state.files.map((f) => [f.fileName, fileRange(f.fileName, f.txns)]));
    const lists = buildPayers(merged.txns);
    const known = new Set([...lists.payers, ...lists.unknown].map((p) => p.key));
    for (const key of state.selected) if (!known.has(key)) state.selected.delete(key);
    return { merged, ranges, lists, report: reportFor(merged.txns) };
  }

  function reportFor(txns: Txn[]): Report {
    const currencies = [...new Set(txns.map((t) => t.currency))].sort();
    const home = state.home && currencies.includes(state.home) ? state.home : likelyHome(txns, currencies);
    // Merged transactions are in date order.
    const span = txns.length > 0 ? { start: txns[0].date, end: txns[txns.length - 1].date } : null;
    // A country's own tax year is the natural default for its own currency. Anyone else is more likely to want calendar years.
    const choice = state.period ?? (home === settings.homeCurrency ? 'tax' : 'calendar');
    let period: PeriodRule;
    let invalid: string | null = null;
    if (choice === 'custom') {
      const start = state.customStart ?? span?.start ?? today;
      const end = state.customEnd ?? span?.end ?? today;
      if (start > end) invalid = 'The "From" date is after the "To" date.';
      period = { kind: 'range', start, end };
    } else {
      period = { kind: 'yearly', start: choice === 'tax' ? settings.taxYearStart : { month: 1, day: 1 } };
    }
    return {
      options: { homeCurrency: home, period, officialRates: settings.officialRates },
      currencies,
      choice,
      words: PERIOD_WORDS[choice],
      invalid,
      span,
    };
  }

  /** Redraws the page after a choice changes, keeping the keyboard on the control that changed. */
  function refresh(focusId: string) {
    render();
    document.getElementById(focusId)?.focus();
  }

  /** The "Totals for" and "Show in" choices at the top of the results pages. */
  function reportControls(report: Report, withCurrency: boolean): HTMLElement {
    const field = (label: string, control: HTMLElement) => h('label', { class: 'field' }, h('span', null, label), control);

    const periodSelect = h(
      'select',
      { id: 'period-choice' },
      h('option', { value: 'tax' }, `${settings.taxYearName}s (${yearSpan(settings.taxYearStart)})`),
      h('option', { value: 'calendar' }, `Calendar years (${yearSpan({ month: 1, day: 1 })})`),
      h('option', { value: 'custom' }, 'Dates you choose'),
    );
    periodSelect.value = report.choice;
    periodSelect.addEventListener('change', () => {
      state.period = periodSelect.value as PeriodChoice;
      refresh('period-choice');
    });
    const fields = [field('Totals for', periodSelect)];

    const rule = report.options.period;
    if (rule.kind === 'range') {
      const date = (id: string, value: string, set: (v: string | null) => void) => {
        const input = h('input', { type: 'date', id });
        input.value = value;
        // "change" fires once a date is picked or typed in full, not on every keystroke.
        input.addEventListener('change', () => {
          set(input.value || null);
          refresh(id);
        });
        return input;
      };
      fields.push(
        field('From', date('custom-from', rule.start, (v) => (state.customStart = v))),
        field('To', date('custom-to', rule.end, (v) => (state.customEnd = v))),
      );
    }

    if (withCurrency && report.currencies.length > 1) {
      const currencySelect = h(
        'select',
        { id: 'home-choice' },
        report.currencies.map((code) => h('option', { value: code }, `${code} (${currencyWords(code)})`)),
      );
      currencySelect.value = report.options.homeCurrency;
      currencySelect.addEventListener('change', () => {
        state.home = currencySelect.value;
        refresh('home-choice');
      });
      fields.push(field('Show in', currencySelect));
    }
    return h('div', { class: 'controls' }, fields);
  }

  function goTo(step: StepId) {
    state.step = step;
    render();
    body.scrollTop = 0;
    head.querySelector('h1')?.focus();
  }

  async function addFiles(files: File[]) {
    addTexts(await Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() }))));
  }

  /** Takes the text of CSV files. Adding a file with the same name again replaces it. */
  function addTexts(items: { name: string; text: string }[]) {
    for (const { name, text } of items) {
      state.files = state.files.filter((f) => f.fileName !== name);
      state.failures = state.failures.filter((f) => f.fileName !== name);
      const result = parseCsv(text, name, settings);
      if (result.ok) state.files.push(result.file);
      else state.failures.push({ fileName: name, error: result.error });
    }
    render();
  }

  function removeFile(fileName: string) {
    state.files = state.files.filter((f) => f.fileName !== fileName);
    state.failures = state.failures.filter((f) => f.fileName !== fileName);
    render();
  }

  function startAgain() {
    state.files = [];
    state.failures = [];
    state.selected.clear();
    state.customStart = null;
    state.customEnd = null;
    state.home = null;
    state.period = null;
    goTo('files');
  }

  const button = (label: string, onClick: () => void, primary = false) => {
    const el = h('button', primary ? { type: 'button', class: 'primary' } : { type: 'button' }, label);
    el.addEventListener('click', onClick);
    return el;
  };
  const back = (to: StepId) => {
    const el = button('Back', () => goTo(to));
    el.classList.add('back');
    return el;
  };
  const spacer = () => h('span', { class: 'spacer' });

  function render() {
    const index = STEPS.findIndex((s) => s.id === state.step);
    const numbered = STEPS.length - 1;
    if (state.step === 'welcome') {
      head.hidden = true;
    } else {
      head.hidden = false;
      const fill = h('div', { class: 'bar-fill' });
      fill.style.width = `${(index / numbered) * 100}%`;
      head.replaceChildren(
        h('div', { class: 'small' }, `Step ${index} of ${numbered}`),
        h('h1', { tabindex: '-1' }, state.step === 'earnings' ? reportFor(mergeFiles(state.files).txns).words.title : STEPS[index].title),
        h('div', { class: 'bar-track' }, fill),
      );
    }
    pages[state.step]();
  }

  const pages: Record<StepId, () => void> = {
    welcome() {
      body.replaceChildren(
        h(
          'div',
          { class: 'hero' },
          h('h1', null, 'Gig Income'),
          h('p', null, 'Add up what you were paid through PayPal, for each tax year or for any dates you choose.'),
          h('p', null, 'You get:'),
          h(
            'ul',
            null,
            h('li', null, h('strong', null, 'your earnings'), ', in the currency you were paid in'),
            h('li', null, `the same earnings in your own currency, at PayPal's rate (and at ${settings.officialRates.name}'s, for pounds)`),
            h('li', null, 'what you withdrew to your card or bank, to check against your statement'),
          ),
          h('p', null, 'Your files are read on this device only. Nothing is uploaded, sent or saved anywhere.'),
        ),
      );
      foot.replaceChildren(spacer(), button('Get started', () => goTo('guide'), true));
    },

    guide() {
      body.replaceChildren(
        h('p', { class: 'lead' }, GUIDE_INTRO),
        h(
          'ol',
          { class: 'guide' },
          GUIDE_STEPS.map((step) =>
            h(
              'li',
              null,
              h('strong', null, step.title),
              h('p', null, step.detail, step.link && ' ', step.link && h('a', { href: step.link.href, target: '_blank', rel: 'noopener noreferrer' }, step.link.label)),
              step.image &&
                h('img', {
                  src: step.image.src,
                  alt: step.image.alt,
                  // Half size: the screenshots were taken on a high-resolution screen.
                  width: String(Math.round(step.image.width / 2)),
                  height: String(Math.round(step.image.height / 2)),
                  loading: 'lazy',
                }),
            ),
          ),
        ),
        h('div', { class: 'callout' }, h('strong', null, 'Good to know'), h('ul', null, GUIDE_TIPS.map((tip) => h('li', null, tip)))),
      );
      foot.replaceChildren(back('welcome'), spacer(), button('I have my files', () => goTo('files'), true));
    },

    files() {
      const { merged, ranges } = work();
      const input = h('input', { type: 'file', accept: '.csv,text/csv', multiple: '', id: 'file-input' });
      const drop = h(
        'label',
        { class: 'drop', for: 'file-input' },
        h('strong', null, 'Drop your PayPal CSV files here'),
        h('span', null, 'You can add several. Overlapping exports are fine.'),
        h('span', { class: 'btn primary' }, 'Choose files'),
        input,
      );
      input.addEventListener('change', () => void addFiles([...(input.files ?? [])]));
      drop.addEventListener('dragover', (e) => {
        e.preventDefault();
        drop.classList.add('over');
      });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('over');
        void addFiles([...(e.dataTransfer?.files ?? [])]);
      });

      body.replaceChildren(drop, fileList(merged.duplicatesRemoved, ranges));
      const next = button('Next', () => goTo('payers'), true);
      next.disabled = state.files.length === 0;
      if (next.disabled) next.title = 'Add at least one PayPal file first';
      foot.replaceChildren(back('guide'), spacer(), next);
    },

    payers() {
      const { lists } = work();
      const parts: (HTMLElement | false)[] = [];
      if (lists.payers.length === 0) {
        parts.push(h('p', { class: 'lead' }, 'No payments received were found in these files.'));
      } else {
        parts.push(
          h('p', { class: 'lead' }, 'Everyone who sent you money is listed. Tick the ones that are earnings. Leave friends, family and refunds unticked.'),
          payerTable(lists.payers, false),
        );
      }
      if (lists.unknown.length > 0) {
        parts.push(
          h('h2', null, 'Other money in'),
          h('p', { class: 'lead' }, 'PayPal gave these a label this tool does not recognise. Ticking one adds it to your earnings, so only tick money you were paid for work. This tool does not deal with expenses.'),
          payerTable(lists.unknown, true),
        );
      }
      body.replaceChildren(...parts.filter((p) => p !== false));
      foot.replaceChildren(back('files'), tickedNote, spacer(), button('See earnings', () => goTo('earnings'), true));
      updateTicked();
    },

    earnings() {
      const { merged, ranges, report } = work();
      const controls = reportControls(report, true);
      foot.replaceChildren(back('payers'), spacer(), button('See withdrawals', () => goTo('withdrawals'), true));
      if (report.invalid) {
        body.replaceChildren(controls, h('p', { class: 'warn' }, report.invalid));
        return;
      }
      const summary = summarise(merged.txns, state.selected, report.options);
      const coverage = coverageOf(ranges, report.options.period);
      // Only show converted figures when something needs converting.
      const converting = summary.periods.some((p) => p.earnings.some((line) => !line.isHome));
      const showOfficial = converting && summary.official;
      const blocks = summary.periods
        .map((p) => earningsBlock(p, coverage.byKey.get(p.key), coverage.approximate, report, converting, showOfficial))
        .filter((b) => b !== null);
      const home = report.options.homeCurrency;
      const homeWords = currencyWords(home);
      const authority = settings.officialRates.name;
      body.replaceChildren(
        ...[
          controls,
          holesWarning(coverage.periods, coverage.approximate),
          ...(blocks.length > 0 ? blocks : [h('p', { class: 'lead' }, nothingToShow(report, coverage.periods, 'earnings'))]),
          summary.conversionsLeftOut > 0 &&
            h('p', { class: 'warn' }, `${plural(summary.conversionsLeftOut, 'currency conversion')} could not be matched to its other half and ${summary.conversionsLeftOut === 1 ? 'was' : 'were'} left out of the rates.`),
          blocks.length > 0 &&
            showOfficial &&
            h(
              'div',
              { class: 'callout' },
              h('strong', null, `Two ways of turning your earnings into ${homeWords}`),
              h(
                'ul',
                null,
                h('li', null, h('strong', null, 'PayPal gave you: '), `the ${homeWords} that actually reached you, after PayPal's exchange fee.`),
                h('li', null, h('strong', null, `At ${authority}'s rates: `), `what the same money was worth at ${authority}'s official rate for the month you were paid, before any fee.`),
              ),
              h('p', null, 'This tool does not say which one to report.'),
            ),
          blocks.length > 0 &&
            converting &&
            !showOfficial &&
            h(
              'div',
              { class: 'callout' },
              h('strong', null, `${capital(homeWords)} PayPal gave you`),
              h('p', null, `The ${homeWords} that actually reached you, after PayPal's exchange fee. It is worked out from the currency conversions in your files.`),
            ),
          blocks.length > 0 && supportCard(),
        ].filter((part) => part !== false && part !== null),
      );
    },

    withdrawals() {
      const { merged, ranges, report } = work();
      const controls = reportControls(report, false);
      foot.replaceChildren(back('earnings'), spacer(), confirmButton('Start again', 'Clear everything?', startAgain));
      if (report.invalid) {
        body.replaceChildren(controls, h('p', { class: 'warn' }, report.invalid));
        return;
      }
      const summary = summarise(merged.txns, state.selected, report.options);
      const coverage = coverageOf(ranges, report.options.period);
      const rows = summary.periods.flatMap((period) =>
        period.withdrawals.map((w) =>
          h(
            'tr',
            null,
            h(
              'td',
              null,
              period.label,
              ' ',
              partYearTag(coverage.byKey.get(period.key), report),
              partYearNotes(coverage.byKey.get(period.key), coverage.approximate, report).map((note) => h('div', { class: 'small' }, note)),
            ),
            h('td', { class: 'num' }, money(w.amount, w.currency)),
            h('td', null, plural(w.withdrawals, 'withdrawal') + (w.reversals > 0 ? `, less ${w.reversals} that bounced back` : '')),
          ),
        ),
      );
      body.replaceChildren(
        ...[
          controls,
          h('p', { class: 'lead' }, 'This is separate from earnings. Use it to check against your bank statement. It includes everything you withdrew, whatever the money was from.'),
          holesWarning(coverage.periods, coverage.approximate),
          rows.length > 0
            ? scroll(h('table', null, h('thead', null, h('tr', null, h('th', null, report.words.column), h('th', { class: 'num' }, 'Withdrawn'), h('th', null, 'Made up of'))), h('tbody', null, rows)))
            : h('p', null, nothingToShow(report, coverage.periods, 'withdrawals')),
        ].filter((part) => part !== null),
      );
    },
  };

  /** What to say when a results page has nothing to list. */
  function nothingToShow(report: Report, periods: PeriodCoverage[], what: 'earnings' | 'withdrawals'): string {
    if (report.options.period.kind === 'range' && periods[0]?.untouched && report.span) {
      return `None of your files cover these dates. Your files run from ${span(report.span)}.`;
    }
    const within = report.options.period.kind === 'range' ? ' between these dates' : '';
    if (what === 'withdrawals') return `No withdrawals were found${within}.`;
    if (state.selected.size === 0) return 'Nothing is ticked yet. Go back and tick at least one payer to see your earnings.';
    return `No earnings from the ticked payers${within}.`;
  }

  // Shown beside Back on the payers page.
  const tickedNote = h('span', { class: 'small' });
  function updateTicked() {
    const n = state.selected.size;
    tickedNote.textContent = n === 0 ? 'Nothing ticked yet' : `${n} ticked`;
  }

  function fileList(duplicatesRemoved: number, ranges: Map<string, FileRange | null>): HTMLElement {
    // Long names are cut short with "…"; hovering shows the whole name.
    const fileName = (name: string) => h('div', { class: 'file-name', title: name }, name);
    const removeButton = (name: string) => confirmButton('Remove', 'Confirm', () => removeFile(name));

    const items = [
      ...state.failures.map((f) =>
        h('li', { class: 'file bad' }, h('div', { class: 'file-row' }, h('div', { class: 'file-info' }, fileName(f.fileName)), removeButton(f.fileName)), h('p', { class: 'error' }, f.error)),
      ),
      ...state.files.map((f) => {
        const range = ranges.get(f.fileName);
        return h(
          'li',
          { class: 'file' },
          h(
            'div',
            { class: 'file-row' },
            h(
              'div',
              { class: 'file-info' },
              fileName(f.fileName),
              h('div', { class: 'small' }, plural(f.txns.length, 'transaction') + (range ? ` · ${span(range)}` : '')),
            ),
            removeButton(f.fileName),
          ),
          f.warnings.map((w) => h('p', { class: 'warn' }, w)),
          f.rowErrors.length > 0 &&
            h(
              'details',
              { class: 'error' },
              h('summary', null, `${plural(f.rowErrors.length, 'row')} could not be read and ${f.rowErrors.length === 1 ? 'was' : 'were'} left out. The totals may be wrong.`),
              h('ul', null, f.rowErrors.slice(0, 50).map((e) => h('li', null, `Row ${e.row}: ${e.message}`))),
            ),
        );
      }),
    ];

    return h(
      'div',
      null,
      h('ul', { class: 'files' }, items),
      duplicatesRemoved > 0 &&
        h('p', { class: 'note' }, `${plural(duplicatesRemoved, 'transaction')} appeared in more than one file and ${duplicatesRemoved === 1 ? 'was' : 'were'} counted once.`),
    );
  }

  /** How much of each period the files cover. */
  function coverageOf(ranges: Map<string, FileRange | null>, rule: PeriodRule) {
    const coverage = checkCoverage([...ranges.values()].filter((r) => r !== null), rule, today);
    return { byKey: new Map(coverage.periods.map((p) => [p.key, p])), periods: coverage.periods, approximate: coverage.approximate };
  }

  /**
   * Plain notes for a period the files only partly cover. A late start or an
   * early finish is normal (someone started work mid-year, or the year is not
   * over), so these are information, not warnings.
   */
  function partYearNotes(period: PeriodCoverage | undefined, approximate: boolean, report: Report): string[] {
    const notes: string[] = [];
    if (!period || period.untouched) return notes;
    for (const gap of period.gaps) {
      if (gap.kind === 'before') {
        const from = day(addDays(gap.end, 1));
        const where = approximate ? 'the first transaction in your files' : 'where your files start';
        notes.push(`Counted from ${from}, ${where}. Nothing is missing if you had no PayPal payments before then.`);
      } else if (gap.kind === 'after') {
        const upTo = day(addDays(gap.start, -1));
        const where = approximate ? 'the last transaction in your files' : 'where your files end';
        notes.push(
          period.inProgress
            ? `${report.words.notOver} Counted up to ${upTo}, ${where}.`
            : `Counted up to ${upTo}, ${where}. Nothing is missing if you had no PayPal payments after that.`,
        );
      }
    }
    return notes;
  }

  /** "part year" or "so far" beside a period's name, or nothing when the files cover all of it. */
  function partYearTag(period: PeriodCoverage | undefined, report: Report): HTMLElement | false {
    if (!period || !period.gaps.some((g) => g.kind !== 'between')) return false;
    const soFar = period.inProgress && period.gaps.every((g) => g.kind !== 'before');
    return h('span', { class: 'tag' }, soFar ? 'so far' : report.words.tag);
  }

  /** A hole between two files usually means a file is missing, so this one is a warning. */
  function holesWarning(periods: PeriodCoverage[], approximate: boolean): HTMLElement | null {
    const holes = periods.flatMap((p) => p.gaps.filter((g) => g.kind === 'between').map((g) => `${p.label}: ${span(g)}`));
    if (holes.length === 0) return null;
    return h(
      'div',
      { class: 'warn box' },
      h('strong', null, 'There is a gap between your files.'),
      h('ul', null, holes.map((hole) => h('li', null, hole))),
      h(
        'p',
        null,
        approximate
          ? 'No transactions were found for these dates. If that is not just a quiet spell, a file is missing and anything in the gap is not counted.'
          : 'None of your files cover these dates, so anything in the gap is not counted. Add an export that covers them.',
      ),
    );
  }

  function payerTable(groups: PayerGroup[], showType: boolean) {
    const rows = groups.map((group) => {
      const box = h('input', { type: 'checkbox', id: `tick-${group.key}` });
      box.checked = state.selected.has(group.key);
      const otherNames = group.names.filter((n) => n !== group.label);
      const row = h(
        'tr',
        { class: box.checked ? 'pick selected' : 'pick' },
        h('td', { class: 'tick' }, box),
        h(
          'td',
          null,
          h('label', { for: `tick-${group.key}` }, group.label),
          group.email && group.email !== group.label && h('div', { class: 'small' }, group.email),
          otherNames.length > 0 && h('div', { class: 'small' }, `Also shown as: ${otherNames.join(', ')}`),
          group.matchesPurchase &&
            h('div', { class: 'small' }, 'Probably not income: each one matches something you bought for the same amount, so it looks like PayPal moving money in to pay for it.'),
        ),
        showType && h('td', null, group.types.join(', ')),
        h('td', { class: 'num' }, group.count),
        h('td', { class: 'num' }, Object.entries(group.totals).map(([currency, total]) => h('div', null, money(total, currency)))),
      );
      box.addEventListener('change', () => {
        if (box.checked) state.selected.add(group.key);
        else state.selected.delete(group.key);
        row.classList.toggle('selected', box.checked);
        updateTicked();
      });
      // Clicking anywhere on the row ticks it. The box and its label already do that themselves.
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('input, label')) return;
        box.click();
      });
      return row;
    });
    return scroll(h(
      'table',
      null,
      h('thead', null, h('tr', null, h('th', null, 'Count as earnings?'), h('th', null, 'From'), showType && h('th', null, "PayPal's label"), h('th', { class: 'num' }, 'Payments'), h('th', { class: 'num' }, 'Total'))),
      h('tbody', null, rows),
    ));
  }

  function paypalCell(line: EarningsLine, report: Report): HTMLElement {
    const home = report.options.homeCurrency;
    if (line.isHome) return h('td', { class: 'num' }, money(line.earned, home));
    if (line.homeValue === null) {
      return h('td', { class: 'num' }, h('span', { class: 'warn' }, 'No estimate'), h('div', { class: 'small' }, `PayPal converted no ${line.currency} to ${home} ${report.words.within}`));
    }
    const rate = displayRate(line.converted, line.currency, line.homeReceived, home);
    // The short rate is for a glance; hovering gives the working.
    const working = `PayPal turned ${money(line.converted, line.currency)} into ${money(line.homeReceived, home)} ${report.words.within}. That average rate is applied to what you earned.`;
    return h(
      'td',
      { class: 'num' },
      `${money(line.homeValue, home)} `,
      h('span', { class: 'tag' }, 'estimate'),
      h('div', { class: 'small', title: working }, formatRate(rate, line.currency, home, settings.locale)),
    );
  }

  function officialCell(line: EarningsLine, report: Report): HTMLElement {
    const home = report.options.homeCurrency;
    const table = settings.officialRates;
    if (line.isHome) return h('td', { class: 'num' }, money(line.earned, home));
    if (line.officialValue === null) {
      const months = line.officialMissingMonths.map((m) => formatMonth(m, settings.locale)).join(', ');
      return h(
        'td',
        { class: 'num' },
        h('span', { class: 'warn' }, 'No figure'),
        h(
          'div',
          { class: 'small', title: `This tool's ${table.name} rates run from ${formatMonth(table.from, settings.locale)} to ${formatMonth(table.to, settings.locale)}.` },
          `No ${table.name} rate for ${months}`,
        ),
      );
    }
    const rate = displayRate(line.earned, line.currency, line.officialValue, home);
    return h(
      'td',
      { class: 'num' },
      money(line.officialValue, home),
      h(
        'div',
        { class: 'small', title: `Each payment is valued at ${table.name}'s published rate for the month it arrived. This is the average that works out to.` },
        formatRate(rate, line.currency, home, settings.locale),
      ),
    );
  }

  function earningsBlock(
    period: PeriodSummary,
    covered: PeriodCoverage | undefined,
    approximate: boolean,
    report: Report,
    converting: boolean,
    showOfficial: boolean,
  ): HTMLElement | null {
    if (period.earnings.length === 0) return null;
    const home = report.options.homeCurrency;
    const homeWords = capital(currencyWords(home));
    const authority = settings.officialRates.name;
    const rows = period.earnings.map((line) =>
      h(
        'tr',
        null,
        h('td', null, line.currency),
        h('td', { class: 'num' }, money(line.earned, line.currency)),
        h('td', { class: 'num' }, line.count),
        converting && paypalCell(line, report),
        showOfficial && officialCell(line, report),
      ),
    );
    const leftOut = (missing: EarningsLine[]) => h('div', { class: 'small' }, `Not counting the ${missing.map((l) => l.currency).join(' and ')} above`);
    const estimated = period.earnings.some((line) => !line.isHome && line.homeValue !== null);
    const paypalTotal = period.homeTotalComplete
      ? [`${money(period.homeTotal, home)} `, estimated && h('span', { class: 'tag' }, 'estimate')]
      : [money(period.homeTotal, home), leftOut(period.earnings.filter((l) => l.homeValue === null))];
    const officialTotal = period.officialTotalComplete
      ? money(period.officialTotal, home)
      : [money(period.officialTotal, home), leftOut(period.earnings.filter((l) => l.officialValue === null))];
    const count = period.earnings.reduce((sum, line) => sum + line.count, 0);
    // Nothing to convert: every payment is already in the home currency, so the total sits under "Earned".
    const total = converting
      ? h('tr', null, h('th', { colspan: '3' }, `Total in ${home}`), h('th', { class: 'num' }, paypalTotal), showOfficial && h('th', { class: 'num' }, officialTotal))
      : h('tr', null, h('th', null, 'Total'), h('th', { class: 'num' }, money(period.homeTotal, home)), h('th', { class: 'num' }, count));
    return h(
      'div',
      { class: 'year' },
      h('h3', null, `${period.label} `, h('span', { class: 'small' }, `(${span(period)})`), partYearTag(covered, report)),
      partYearNotes(covered, approximate, report).map((note) => h('p', { class: 'year-note' }, note)),
      h(
        'table',
        { class: showOfficial ? 'cols-5' : converting ? 'cols-4' : 'cols-3' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', null, 'Paid in'),
            h('th', { class: 'num' }, 'Earned'),
            h('th', { class: 'num' }, 'Payments'),
            converting && h('th', { class: 'num' }, `${homeWords} PayPal gave you`),
            showOfficial && h('th', { class: 'num' }, `${homeWords} at ${authority}'s rates`),
          ),
        ),
        h('tbody', null, rows),
        h('tfoot', null, total),
      ),
    );
  }

  render();
  return { addTexts, goTo };
}
