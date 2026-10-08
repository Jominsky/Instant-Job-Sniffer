/** Pay comparison. Pay is only ever compared like with like (same unit), because turning hourly or monthly internship pay into
 *  a yearly figure would misstate it. Jobs with no parsed pay are left out, never guessed. */
export type Period = "HOUR" | "MONTH" | "WEEK" | "YEAR";
export const PERIOD_ORDER: Period[] = ["HOUR", "MONTH", "WEEK", "YEAR"];
export const PERIOD_LABEL: Record<Period, string> = { HOUR: "Per hour", MONTH: "Per month", WEEK: "Per week", YEAR: "Per year" };

export type PayInput = { key: string; period: string | null; min: number | null; max: number | null };
export type PayGroup = { key: string; period: Period; n: number; median: number; low: number; high: number };

const isPeriod = (p: string | null): p is Period => !!p && (PERIOD_ORDER as string[]).includes(p);

/** Rows stored before pay periods existed hold annual figures and have no period. */
export function periodOf(j: { period: string | null; min: number | null; max: number | null }): Period | null {
  if (isPeriod(j.period)) return j.period;
  return j.period === null && (j.min != null || j.max != null) ? "YEAR" : null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function payGroups(jobs: PayInput[]): PayGroup[] {
  const buckets = new Map<string, { key: string; period: Period; mids: number[]; lows: number[]; highs: number[] }>();
  for (const j of jobs) {
    const period = periodOf(j);
    const lo = j.min ?? j.max, hi = j.max ?? j.min;
    if (!period || lo == null || hi == null) continue;
    const id = `${period}|${j.key}`;
    const b = buckets.get(id) ?? { key: j.key, period, mids: [], lows: [], highs: [] };
    b.mids.push((lo + hi) / 2); b.lows.push(lo); b.highs.push(hi); buckets.set(id, b);
  }
  return [...buckets.values()]
    .map((b) => ({ key: b.key, period: b.period, n: b.mids.length, median: median(b.mids)!, low: Math.min(...b.lows), high: Math.max(...b.highs) }))
    .sort((a, b) => PERIOD_ORDER.indexOf(a.period) - PERIOD_ORDER.indexOf(b.period) || b.median - a.median || a.key.localeCompare(b.key));
}

const trim = (n: number) => String(Math.round(n * 100) / 100);

export function fmtPay(v: number, period: Period): string {
  switch (period) {
    case "HOUR": return `$${trim(v)}/hr`;
    case "MONTH": return `$${Math.round(v).toLocaleString("en-US")}/mo`;
    case "WEEK": return `$${Math.round(v).toLocaleString("en-US")}/wk`;
    case "YEAR": return v >= 1000 ? `$${trim(Math.round(v / 100) / 10)}k/yr` : `$${Math.round(v)}/yr`;
  }
}

export const fmtRange = (low: number, high: number, period: Period) =>
  low === high ? fmtPay(low, period) : `${fmtPay(low, period).replace(/\/\w+$/, "")} – ${fmtPay(high, period)}`;
