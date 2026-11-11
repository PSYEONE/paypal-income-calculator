import { checkCoverage, fileRange, type DateRange, type FileRange, type YearCoverage } from '../core/coverage';
import { addDays, formatDate, formatMonth } from '../core/dates';
import { mergeFiles } from '../core/merge';
import { displayRate, formatMoney, formatRate } from '../core/money';
import { parseCsv } from '../core/parse';
import { buildPayers, type PayerGroup } from '../core/payers';
import { summarise, type EarningsLine, type YearSummary } from '../core/summary';
import type { ParsedFile } from '../core/types';
import { settings } from '../settings';
import { h } from './dom';
import { GUIDE_INTRO, GUIDE_STEPS, GUIDE_TIPS } from './guide';

/** The pages of the wizard, in order. The welcome page is not a numbered step. */
const STEPS = [
  { id: 'welcome', title: 'PayPal Income Calculator' },
  { id: 'guide', title: 'Get your files from PayPal' },
  { id: 'files', title: 'Add your PayPal files' },
  { id: 'payers', title: 'Tick who paid you for work' },
  { id: 'earnings', title: 'Earnings by tax year' },
  { id: 'withdrawals', title: 'Money withdrawn to your card or bank' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];

interface State {
  step: StepId;
  files: ParsedFile[];
  failures: { fileName: string; error: string }[];
  /** Tick-box keys of the payers the user counts as earnings. */
  selected: Set<string>;
}

const money = (minor: number, currency: string) => formatMoney(minor, currency, settings.locale);
const day = (iso: string) => formatDate(iso, settings.locale);
const span = (range: DateRange) => (range.start === range.end ? day(range.start) : `${day(range.start)} to ${day(range.end)}`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
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

/** Today's date on this device, as "YYYY-MM-DD". */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function createApp(root: HTMLElement, today: string = todayIso()) {
  const state: State = { step: 'welcome', files: [], failures: [], selected: new Set() };

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
    return { merged, ranges, lists };
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
        h('h1', { tabindex: '-1' }, STEPS[index].title),
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
          h('h1', null, 'PayPal Income Calculator'),
          h('p', null, 'Add up what you were paid through PayPal in each UK tax year.'),
          h('p', null, 'You get:'),
          h(
            'ul',
            null,
            h('li', null, h('strong', null, 'earnings per tax year'), ', in the currency you were paid in'),
            h('li', null, `the same earnings in pounds, at PayPal's rate and at ${settings.officialRates.name}'s`),
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
      const { merged, ranges } = work();
      const summary = summarise(merged.txns, state.selected, settings);
      const coverage = coverageOf(ranges);
      const blocks = summary.years.map((year) => earningsBlock(year, coverage.byYear.get(year.taxYear), coverage.approximate)).filter((b) => b !== null);
      const authority = settings.officialRates.name;
      body.replaceChildren(
        ...[
          holesWarning(coverage.years, coverage.approximate),
          ...(blocks.length > 0
            ? blocks
            : [h('p', { class: 'lead' }, state.selected.size === 0 ? 'Nothing is ticked yet. Go back and tick at least one payer to see your earnings.' : 'No earnings from the ticked payers.')]),
          summary.conversionsLeftOut > 0 &&
            h('p', { class: 'warn' }, `${plural(summary.conversionsLeftOut, 'currency conversion')} could not be matched to its other half and ${summary.conversionsLeftOut === 1 ? 'was' : 'were'} left out of the rates.`),
          blocks.length > 0 &&
            h(
              'div',
              { class: 'callout' },
              h('strong', null, 'Two ways of turning your earnings into pounds'),
              h(
                'ul',
                null,
                h('li', null, h('strong', null, 'PayPal gave you: '), "the pounds that actually reached you, after PayPal's exchange fee."),
                h('li', null, h('strong', null, `At ${authority}'s rates: `), `what the same money was worth at ${authority}'s official rate for the month you were paid, before any fee.`),
              ),
              h('p', null, 'This tool does not say which one to report.'),
            ),
        ].filter((part) => part !== false && part !== null),
      );
      foot.replaceChildren(back('payers'), spacer(), button('See withdrawals', () => goTo('withdrawals'), true));
    },

    withdrawals() {
      const { merged, ranges } = work();
      const summary = summarise(merged.txns, state.selected, settings);
      const coverage = coverageOf(ranges);
      const rows = summary.years.flatMap((year) =>
        year.withdrawals.map((w) =>
          h(
            'tr',
            null,
            h(
              'td',
              null,
              year.label,
              ' ',
              partYearTag(coverage.byYear.get(year.taxYear)),
              partYearNotes(coverage.byYear.get(year.taxYear), coverage.approximate).map((note) => h('div', { class: 'small' }, note)),
            ),
            h('td', { class: 'num' }, money(w.amount, w.currency)),
            h('td', null, plural(w.withdrawals, 'withdrawal') + (w.reversals > 0 ? `, less ${w.reversals} that bounced back` : '')),
          ),
        ),
      );
      body.replaceChildren(
        ...[
          h('p', { class: 'lead' }, 'This is separate from earnings. Use it to check against your bank statement. It includes everything you withdrew, whatever the money was from.'),
          holesWarning(coverage.years, coverage.approximate),
          rows.length > 0
            ? scroll(h('table', null, h('thead', null, h('tr', null, h('th', null, 'Tax year'), h('th', { class: 'num' }, 'Withdrawn'), h('th', null, 'Made up of'))), h('tbody', null, rows)))
            : h('p', null, 'No withdrawals were found in these files.'),
        ].filter((part) => part !== null),
      );
      foot.replaceChildren(back('earnings'), spacer(), confirmButton('Start again', 'Clear everything?', startAgain));
    },
  };

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

  /** How much of each tax year the files cover. */
  function coverageOf(ranges: Map<string, FileRange | null>) {
    const coverage = checkCoverage([...ranges.values()].filter((r) => r !== null), settings, today);
    return { byYear: new Map(coverage.years.map((y) => [y.taxYear, y])), years: coverage.years, approximate: coverage.approximate };
  }

  /**
   * Plain notes for a tax year the files only partly cover. A late start or an
   * early finish is normal (someone started work mid-year, or the year is not
   * over), so these are information, not warnings.
   */
  function partYearNotes(year: YearCoverage | undefined, approximate: boolean): string[] {
    const notes: string[] = [];
    for (const gap of year?.gaps ?? []) {
      if (gap.kind === 'before') {
        const from = day(addDays(gap.end, 1));
        notes.push(
          approximate
            ? `Counted from ${from}, the first transaction in your files. Nothing is missing if you had no PayPal payments earlier in this tax year.`
            : `Counted from ${from}, where your files start. Nothing is missing if you had no PayPal payments earlier in this tax year.`,
        );
      } else if (gap.kind === 'after') {
        const upTo = day(addDays(gap.start, -1));
        const where = approximate ? 'the last transaction in your files' : 'where your files end';
        notes.push(
          year!.inProgress
            ? `This tax year is not over yet. Counted up to ${upTo}, ${where}.`
            : `Counted up to ${upTo}, ${where}. Nothing is missing if you had no PayPal payments later in this tax year.`,
        );
      }
    }
    return notes;
  }

  /** "part year" or "so far" beside a tax year's name, or nothing for a whole year. */
  function partYearTag(year: YearCoverage | undefined): HTMLElement | false {
    if (!year || !year.gaps.some((g) => g.kind !== 'between')) return false;
    const soFar = year.inProgress && year.gaps.every((g) => g.kind !== 'before');
    return h('span', { class: 'tag' }, soFar ? 'so far' : 'part year');
  }

  /** A hole between two files usually means a file is missing, so this one is a warning. */
  function holesWarning(years: YearCoverage[], approximate: boolean): HTMLElement | null {
    const holes = years.flatMap((y) => y.gaps.filter((g) => g.kind === 'between').map((g) => `${y.label}: ${span(g)}`));
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

  function paypalCell(line: EarningsLine): HTMLElement {
    const home = settings.homeCurrency;
    if (line.isHome) return h('td', { class: 'num' }, money(line.earned, home));
    if (line.homeValue === null) {
      return h('td', { class: 'num' }, h('span', { class: 'warn' }, 'No estimate'), h('div', { class: 'small' }, `PayPal converted no ${line.currency} this tax year`));
    }
    const rate = displayRate(line.converted, line.currency, line.homeReceived, home);
    // The short rate is for a glance; hovering gives the working.
    const working = `In this tax year PayPal turned ${money(line.converted, line.currency)} into ${money(line.homeReceived, home)}. That average rate is applied to what you earned.`;
    return h(
      'td',
      { class: 'num' },
      `${money(line.homeValue, home)} `,
      h('span', { class: 'tag' }, 'estimate'),
      h('div', { class: 'small', title: working }, formatRate(rate, line.currency, home, settings.locale)),
    );
  }

  function officialCell(line: EarningsLine): HTMLElement {
    const home = settings.homeCurrency;
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

  function earningsBlock(year: YearSummary, covered: YearCoverage | undefined, approximate: boolean): HTMLElement | null {
    if (year.earnings.length === 0) return null;
    const home = settings.homeCurrency;
    const authority = settings.officialRates.name;
    const rows = year.earnings.map((line) =>
      h('tr', null, h('td', null, line.currency), h('td', { class: 'num' }, money(line.earned, line.currency)), h('td', { class: 'num' }, line.count), paypalCell(line), officialCell(line)),
    );
    const leftOut = (missing: EarningsLine[]) => h('div', { class: 'small' }, `Not counting the ${missing.map((l) => l.currency).join(' and ')} above`);
    const estimated = year.earnings.some((line) => !line.isHome && line.homeValue !== null);
    const paypalTotal = year.homeTotalComplete
      ? [`${money(year.homeTotal, home)} `, estimated && h('span', { class: 'tag' }, 'estimate')]
      : [money(year.homeTotal, home), leftOut(year.earnings.filter((l) => l.homeValue === null))];
    const officialTotal = year.officialTotalComplete
      ? money(year.officialTotal, home)
      : [money(year.officialTotal, home), leftOut(year.earnings.filter((l) => l.officialValue === null))];
    return h(
      'div',
      { class: 'year' },
      h('h3', null, `${year.label} `, h('span', { class: 'small' }, `(${span(year)})`), partYearTag(covered)),
      partYearNotes(covered, approximate).map((note) => h('p', { class: 'year-note' }, note)),
      h(
        'table',
        null,
        h(
          'thead',
          null,
          h('tr', null, h('th', null, 'Paid in'), h('th', { class: 'num' }, 'Earned'), h('th', { class: 'num' }, 'Payments'), h('th', { class: 'num' }, 'Pounds PayPal gave you'), h('th', { class: 'num' }, `Pounds at ${authority}'s rates`)),
        ),
        h('tbody', null, rows),
        h('tfoot', null, h('tr', null, h('th', { colspan: '3' }, `Total in ${home}`), h('th', { class: 'num' }, paypalTotal), h('th', { class: 'num' }, officialTotal))),
      ),
    );
  }

  render();
  return { addTexts, goTo };
}
