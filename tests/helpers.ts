import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCsv } from '../src/core/parse';
import type { ParsedFile, Txn } from '../src/core/types';
import { UK } from '../src/settings';

export function fixtureText(name: string): string {
  return readFileSync(resolve('tests/fixtures', name), 'utf8');
}

export function loadFixture(name: string, fileName = name): ParsedFile {
  const result = parseCsv(fixtureText(name), fileName, UK);
  if (!result.ok) throw new Error(result.error);
  return result.file;
}

let counter = 0;
/** A made-up transaction for small tests. */
export function txn(partial: Partial<Txn>): Txn {
  counter++;
  return {
    date: '2024-06-01',
    time: '12:00:00',
    description: 'Mobile Payment',
    currency: 'GBP',
    gross: 1000,
    txnId: `X${counter}`,
    email: '',
    name: '',
    refTxnId: '',
    rowKey: `row${counter}`,
    ...partial,
  };
}
