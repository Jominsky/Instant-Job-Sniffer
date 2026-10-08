/** CSV writer for exports. Quotes per RFC 4180 and neutralises spreadsheet formula injection: a text cell that starts with
 *  = + - @ (or a tab/CR) is prefixed with an apostrophe so Excel/Sheets show it as text instead of running it. */
export type Cell = string | number | boolean | Date | null | undefined;

export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : typeof v === "string" ? v : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Cell[][], opts: { bom?: boolean } = {}): string {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return (opts.bom ? "﻿" : "") + body;
}
