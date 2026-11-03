export type CsvCell = string | number | null | undefined;

function cell(value: CsvCell): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV text with CRLF line ends, which Excel and accounting packages both read. */
export function toCsv(rows: CsvCell[][]): string {
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

/** Starts a download in the browser. Client components only. */
export function downloadCsv(filename: string, rows: CsvCell[][]) {
  const blob = new Blob(["﻿", toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
