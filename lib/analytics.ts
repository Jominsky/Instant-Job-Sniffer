// Pure helpers (no framework imports) so they can be unit-tested with plain Node.
export const OA = ["OA_RECEIVED", "OA_COMPLETED"];
export const INTERVIEW = ["RECRUITER_SCREEN", "TECHNICAL_INTERVIEW", "FINAL_ROUND"];
export const SUBMITTED_STATUSES = ["APPLIED", ...OA, ...INTERVIEW, "OFFER"];

export type AppFacts = { status: string; dateApplied: string | Date | null; history: string[] };

/** "Ever reached" semantics: a candidate rejected after an OA still counts toward the OA rate. Falls back to the current
 *  status for applications created before status history existed. */
export function reached(a: AppFacts, set: string[]): boolean {
  return set.includes(a.status) || a.history.some((h) => set.includes(h));
}
export function isSubmitted(a: AppFacts): boolean {
  return !!a.dateApplied || reached(a, SUBMITTED_STATUSES);
}

export function funnel(apps: AppFacts[]) {
  const submitted = apps.filter(isSubmitted);
  const n = submitted.length;
  const count = (set: string[]) => submitted.filter((a) => reached(a, set)).length;
  const pct = (x: number) => (n ? Math.round((x / n) * 1000) / 10 : null);
  const oa = count(OA), interview = count(INTERVIEW), offer = count(["OFFER"]), rejected = count(["REJECTED"]);
  return { submitted: n, oa, interview, offer, rejected, oaRate: pct(oa), interviewRate: pct(interview), offerRate: pct(offer), rejectionRate: pct(rejected) };
}

/** Counts per ISO-week-start (Monday, UTC) for the last `weeks` weeks, oldest first. */
export function weeklyBuckets(dates: (Date | string)[], weeks: number, now: Date = new Date()) {
  const monday = (d: Date) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };
  const start = monday(now); start.setUTCDate(start.getUTCDate() - 7 * (weeks - 1));
  const out = Array.from({ length: weeks }, (_, i) => { const d = new Date(start); d.setUTCDate(d.getUTCDate() + 7 * i); return { label: d.toISOString().slice(5, 10), count: 0, t: d.getTime() }; });
  for (const raw of dates) {
    const t = monday(new Date(raw)).getTime();
    const b = out.find((x) => x.t === t);
    if (b) b.count++;
  }
  return out.map(({ label, count }) => ({ label, count }));
}

export function topCounts<T>(items: T[], key: (t: T) => string | null | undefined, limit = 8) {
  const m = new Map<string, number>();
  for (const it of items) { const k = key(it)?.trim(); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([label, count]) => ({ label, count }));
}

/** Mean hours between the job being discovered by us and the user applying. Negative gaps (applied before we saw it) are ignored. */
export function avgDelayHours(pairs: { discovered: string | Date; applied: string | Date | null }[]): number | null {
  const gaps = pairs.filter((p) => p.applied).map((p) => (new Date(p.applied!).getTime() - new Date(p.discovered).getTime()) / 3600_000).filter((h) => h >= 0);
  return gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
}

export function fmtDelay(h: number | null): string {
  if (h == null) return "—";
  return h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`;
}
