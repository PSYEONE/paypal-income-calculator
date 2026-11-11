/** One row of a PayPal export, cleaned up. */
export interface Txn {
  /** YYYY-MM-DD, exactly the day written in the file (no time zone shifting). */
  date: string;
  time: string;
  description: string;
  currency: string;
  /** Whole pence or cents. Never a fraction. */
  gross: number;
  txnId: string;
  email: string;
  name: string;
  refTxnId: string;
  /** Every field of the original row, used to spot the same row in two files. */
  rowKey: string;
}

export interface RowError {
  /** Row number in the file, counting the header as row 1. */
  row: number;
  message: string;
}

export interface ParsedFile {
  fileName: string;
  layoutId: string;
  txns: Txn[];
  warnings: string[];
  /** Rows that could not be read and were left out. */
  rowErrors: RowError[];
}

export type ParseResult =
  | { ok: true; file: ParsedFile }
  | { ok: false; fileName: string; error: string };
