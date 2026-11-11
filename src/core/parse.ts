import Papa from 'papaparse';
import type { CountrySettings } from '../settings';
import { detectDateOrder, parseDate } from './dates';
import { detectLayout } from './layouts';
import { parseAmount } from './money';
import type { ParseResult, RowError, Txn } from './types';

/** Reads the text of one PayPal CSV export. Never throws; problems come back in the result. */
export function parseCsv(text: string, fileName: string, s: CountrySettings): ParseResult {
  const fail = (error: string): ParseResult => ({ ok: false, fileName, error });

  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  const rows = parsed.data;
  if (rows.length === 0) return fail('This file is empty.');

  const header = rows[0].map((cell) => cell.trim());
  const match = detectLayout(header);
  if (!match.ok) return fail(match.error);
  const col = match.index;
  const body = rows.slice(1);

  let order;
  try {
    order = detectDateOrder(body.map((row) => row[col.date] ?? ''), s.defaultDateOrder);
  } catch (e) {
    return fail(`${(e as Error).message} Nothing was counted from this file.`);
  }

  const warnings: string[] = [];
  if (body.length === 0) warnings.push('This file has no transactions in it.');
  if (order.guessed && body.length > 0) {
    warnings.push(
      'The dates in this file could be read as day/month or month/day. They were read as ' +
        (order.order === 'DMY' ? 'day/month/year' : 'month/day/year') +
        '. Check the date range shown looks right.',
    );
  }

  const rowErrors: RowError[] = [];
  const badRows = new Set<number>();
  for (const error of parsed.errors) {
    if (error.row === undefined || error.row === 0 || badRows.has(error.row)) continue;
    badRows.add(error.row);
    rowErrors.push({ row: error.row + 1, message: `Could not be read (${error.message}).` });
  }

  const txns: Txn[] = [];
  body.forEach((row, i) => {
    const rowNumber = i + 2;
    if (badRows.has(i + 1)) return;
    if (row.length !== header.length) {
      rowErrors.push({ row: rowNumber, message: `Has ${row.length} columns, expected ${header.length}.` });
      return;
    }
    const cell = (index: number) => row[index].trim();
    const currency = cell(col.currency).toUpperCase();
    const date = parseDate(cell(col.date), order.order);
    if (!date) {
      rowErrors.push({ row: rowNumber, message: `The date "${cell(col.date)}" could not be read.` });
      return;
    }
    const gross = parseAmount(cell(col.gross), currency);
    if (gross === null || currency === '') {
      rowErrors.push({ row: rowNumber, message: `The amount "${cell(col.gross)}" ${currency} could not be read.` });
      return;
    }
    txns.push({
      date,
      time: cell(col.time),
      description: cell(col.description),
      currency,
      gross,
      txnId: cell(col.txnId),
      email: cell(col.email),
      name: cell(col.name),
      refTxnId: cell(col.refTxnId),
      rowKey: row.map((c) => c.trim()).join('\u001f'),
    });
  });

  return { ok: true, file: { fileName, layoutId: match.layout.id, txns, warnings, rowErrors } };
}
