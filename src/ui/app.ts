import { checkCoverage, fileRange, type DateRange, type FileRange } from '../core/coverage';
import { formatDate, formatMonth } from '../core/dates';
import { mergeFiles } from '../core/merge';
import { displayRate, formatMoney } from '../core/money';
import { parseCsv } from '../core/parse';
import { buildPayers, type PayerGroup } from '../core/payers';
import { summarise, type EarningsLine, type YearSummary } from '../core/summary';
import type { ParsedFile, Txn } from '../core/types';
import { settings } from '../settings';
import { h } from './dom';

interface State {
  files: ParsedFile[];
  failures: { fileName: string; error: string }[];
  /** Tick-box keys of the payers the user counts as earnings. */
  selected: Set<string>;
}

const money = (minor: number, currency: string) => formatMoney(minor, currency, settings.locale);
const day = (iso: string) => formatDate(iso, settings.locale);
const span = (range: DateRange) => (range.start === range.end ? day(range.start) : `${day(range.start)} to ${day(range.end)}`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function createApp(root: HTMLElement) {
  const state: State = { files: [], failures: [], selected: new Set() };

  const filesBox = h('div');
  const payersBox = h('div');
  const resultsBox = h('div');

  const input = h('input', { type: 'file', accept: '.csv,text/csv', multiple: '', id: 'file-input' });
  const drop = h(
    'label',
    { class: 'drop', for: 'file-input' },
    h('strong', null, 'Choose your PayPal CSV files'),
    h('span', null, 'or drop them here. You can add several; overlaps are fine.'),
    input,
  );
  input.addEventListener('change', () => {
    void addFiles([...(input.files ?? [])]);
    input.value = '';
  });
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

  root.append(h('section', null, h('h2', null, '1. Add your PayPal files'), drop, filesBox), payersBox, resultsBox);

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

  function render() {
    const merged = mergeFiles(state.files);
    const ranges = new Map<string, FileRange | null>(state.files.map((f) => [f.fileName, fileRange(f.fileName, f.txns)]));
    renderFiles(merged.duplicatesRemoved, ranges);

    const lists = buildPayers(merged.txns);
    const known = new Set([...lists.payers, ...lists.unknown].map((p) => p.key));
    for (const key of state.selected) if (!known.has(key)) state.selected.delete(key);

    const drawResults = () => renderResults(merged.txns, [...ranges.values()].filter((r) => r !== null));
    renderPayers(lists.payers, lists.unknown, drawResults);
    drawResults();
  }

  function renderFiles(duplicatesRemoved: number, ranges: Map<string, FileRange | null>) {
    const removeButton = (fileName: string) => {
      const button = h('button', { type: 'button', class: 'link' }, 'Remove');
      button.addEventListener('click', () => removeFile(fileName));
      return button;
    };

    const items = [
      ...state.failures.map((f) =>
        h('li', { class: 'file bad' }, h('div', null, h('strong', null, f.fileName), ' ', removeButton(f.fileName)), h('p', { class: 'error' }, f.error)),
      ),
      ...state.files.map((f) => {
        const range = ranges.get(f.fileName);
        return h(
          'li',
          { class: 'file' },
          h(
            'div',
            null,
            h('strong', null, f.fileName),
            ` · ${plural(f.txns.length, 'transaction')}`,
            range ? ` · ${span(range)}` : '',
            ' ',
            removeButton(f.fileName),
          ),
          f.warnings.map((w) => h('p', { class: 'warn' }, w)),
          f.rowErrors.length > 0 &&
            h(
              'details',
              { class: 'error' },
              h('summary', null, `${plural(f.rowErrors.length, 'row')} could not be read and ${f.rowErrors.length === 1 ? 'was' : 'were'} left out. The totals below may be wrong.`),
              h('ul', null, f.rowErrors.slice(0, 50).map((e) => h('li', null, `Row ${e.row}: ${e.message}`))),
            ),
        );
      }),
    ];

    filesBox.replaceChildren(
      h('ul', { class: 'files' }, items),
      duplicatesRemoved > 0 &&
        h('p', { class: 'note' }, `${plural(duplicatesRemoved, 'transaction')} appeared in more than one file and ${duplicatesRemoved === 1 ? 'was' : 'were'} counted once.`) || '',
    );
  }

  function payerTable(groups: PayerGroup[], showType: boolean, onChange: () => void) {
    const rows = groups.map((group) => {
      const box = h('input', { type: 'checkbox', id: `tick-${group.key}` });
      box.checked = state.selected.has(group.key);
      box.addEventListener('change', () => {
        if (box.checked) state.selected.add(group.key);
        else state.selected.delete(group.key);
        onChange();
      });
      const otherNames = group.names.filter((n) => n !== group.label);
      return h(
        'tr',
        null,
        h('td', null, box),
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
    });
    return h(
      'table',
      null,
      h('thead', null, h('tr', null, h('th', null, 'Count as earnings?'), h('th', null, 'From'), showType && h('th', null, "PayPal's label"), h('th', { class: 'num' }, 'Payments'), h('th', { class: 'num' }, 'Total'))),
      h('tbody', null, rows),
    );
  }

  function renderPayers(payers: PayerGroup[], unknown: PayerGroup[], onChange: () => void) {
    if (state.files.length === 0) {
      payersBox.replaceChildren();
      return;
    }
    const section = h('section', null, h('h2', null, '2. Tick who paid you for work'));
    if (payers.length === 0) {
      section.append(h('p', null, 'No payments received were found in these files.'));
    } else {
      section.append(
        h('p', null, 'Everyone who sent you money is listed. Tick the ones that are earnings. Leave friends, family and refunds unticked.'),
        payerTable(payers, false, onChange),
      );
    }
    if (unknown.length > 0) {
      section.append(
        h('h3', null, 'Other money in'),
        h('p', null, 'PayPal gave these a label this tool does not recognise. Ticking one adds it to your earnings, so only tick money you were paid for work. This tool does not deal with expenses.'),
        payerTable(unknown, true, onChange),
      );
    }
    payersBox.replaceChildren(section);
  }

  function paypalCell(line: EarningsLine): HTMLElement {
    const home = settings.homeCurrency;
    if (line.isHome) return h('td', { class: 'num' }, money(line.earned, home));
    if (line.homeValue === null) {
      return h('td', { class: 'num' }, h('span', { class: 'warn' }, `No estimate: PayPal converted no ${line.currency} to ${home} in this tax year.`));
    }
    const rate = displayRate(line.converted, line.currency, line.homeReceived, home);
    return h(
      'td',
      { class: 'num' },
      `about ${money(line.homeValue, home)} `,
      h('span', { class: 'tag' }, 'estimate'),
      h(
        'div',
        { class: 'small' },
        `In this tax year PayPal turned ${money(line.converted, line.currency)} into ${money(line.homeReceived, home)}, ` +
          `an average of ${rate.toFixed(4)} ${home} per 1 ${line.currency}. That average is applied to what you earned.`,
      ),
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
        h('span', { class: 'warn' }, `No figure: this tool has no ${table.name} rate for ${line.currency} in ${months}.`),
        h('div', { class: 'small' }, `Its ${table.name} rates run from ${formatMonth(table.from, settings.locale)} to ${formatMonth(table.to, settings.locale)}.`),
      );
    }
    const rate = displayRate(line.earned, line.currency, line.officialValue, home);
    return h(
      'td',
      { class: 'num' },
      money(line.officialValue, home),
      h(
        'div',
        { class: 'small' },
        `Each payment valued at ${table.name}'s published rate for the month it arrived. ` +
          `That works out at an average of ${rate.toFixed(4)} ${home} per 1 ${line.currency}.`,
      ),
    );
  }

  function earningsBlock(year: YearSummary): HTMLElement | null {
    if (year.earnings.length === 0) return null;
    const home = settings.homeCurrency;
    const authority = settings.officialRates.name;
    const rows = year.earnings.map((line) =>
      h('tr', null, h('td', null, line.currency), h('td', { class: 'num' }, money(line.earned, line.currency)), h('td', { class: 'num' }, line.count), paypalCell(line), officialCell(line)),
    );
    const leftOut = (missing: EarningsLine[]) => `, not counting the ${missing.map((l) => l.currency).join(' and ')} above`;
    const estimated = year.earnings.some((line) => !line.isHome && line.homeValue !== null);
    const paypalTotal = year.homeTotalComplete
      ? `${estimated ? 'about ' : ''}${money(year.homeTotal, home)}`
      : money(year.homeTotal, home) + leftOut(year.earnings.filter((l) => l.homeValue === null));
    const officialTotal = year.officialTotalComplete
      ? money(year.officialTotal, home)
      : money(year.officialTotal, home) + leftOut(year.earnings.filter((l) => l.officialValue === null));
    return h(
      'div',
      { class: 'year' },
      h('h3', null, `${year.label} `, h('span', { class: 'small' }, `(${span(year)})`)),
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

  function renderResults(txns: Txn[], ranges: FileRange[]) {
    if (state.files.length === 0) {
      resultsBox.replaceChildren();
      return;
    }
    const summary = summarise(txns, state.selected, settings);
    const coverage = checkCoverage(ranges, settings);
    const partYears = coverage.years.filter((y) => !y.complete);

    const coverageNote =
      partYears.length > 0 &&
      h(
        'div',
        { class: 'warn box' },
        h('strong', null, 'Your files do not cover every tax year in full.'),
        h('ul', null, partYears.map((y) => h('li', null, `${y.label}: nothing for ${y.gaps.map(span).join(', or ')}.`))),
        h(
          'p',
          null,
          coverage.approximate
            ? 'This is judged from the first and last transaction in each file, so a quiet spell at either end can look like a gap. Figures for these years may be incomplete.'
            : 'Figures for these years are incomplete. Add an export covering the missing dates if you need the whole year.',
        ),
      );

    const earnings = summary.years.map(earningsBlock).filter((b) => b !== null);
    const earningsSection = h(
      'section',
      null,
      h('h2', null, '3. Earnings by tax year'),
      coverageNote,
      earnings.length > 0 ? earnings : h('p', null, state.selected.size === 0 ? 'Tick at least one payer above to see your earnings.' : 'No earnings from the ticked payers.'),
      summary.conversionsLeftOut > 0 &&
        h('p', { class: 'warn' }, `${plural(summary.conversionsLeftOut, 'currency conversion')} could not be matched to its other half and ${summary.conversionsLeftOut === 1 ? 'was' : 'were'} left out of the rates.`),
      earnings.length > 0 &&
        h(
          'p',
          { class: 'note' },
          `About the two pounds figures. "PayPal gave you" is what reached you: it uses PayPal's own average rate for the tax year, which includes PayPal's conversion charge, and reflects the days you withdrew or spent rather than the days you were paid. "At ${settings.officialRates.name}'s rates" values each payment at the exchange rate ${settings.officialRates.name} publishes for the month it arrived, before any PayPal charge. This tool does not tell you which to report.`,
        ),
    );

    const withdrawalRows = summary.years.flatMap((year) =>
      year.withdrawals.map((w) =>
        h(
          'tr',
          null,
          h('td', null, year.label),
          h('td', { class: 'num' }, money(w.amount, w.currency)),
          h('td', null, plural(w.withdrawals, 'withdrawal') + (w.reversals > 0 ? `, less ${w.reversals} that bounced back` : '')),
        ),
      ),
    );
    const withdrawalsSection = h(
      'section',
      null,
      h('h2', null, '4. Money withdrawn to your card or bank'),
      h('p', null, 'This is separate from earnings. Use it to check against your bank statement. It includes everything you withdrew, whatever the money was from.'),
      withdrawalRows.length > 0
        ? h('table', null, h('thead', null, h('tr', null, h('th', null, 'Tax year'), h('th', { class: 'num' }, 'Withdrawn'), h('th', null, 'Made up of'))), h('tbody', null, withdrawalRows))
        : h('p', null, 'No withdrawals were found in these files.'),
    );

    resultsBox.replaceChildren(earningsSection, withdrawalsSection);
  }

  render();
  return { addTexts };
}
