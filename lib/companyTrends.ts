/** Company research from our own history: how much a company hires, when its seasons first appeared, and what roles it posts.
 *  Built only from postings this platform has seen, so it says nothing about the company beyond that. */
export type TrendJob = { firstDiscoveredAt: Date; datePosted: Date | null; status: string; roleCategory: string; experienceLevel: string; targetSeason: string | null; targetYear: number | null };
export type CompanySummary = {
  total: number; open: number; openEntryLevel: number; last30Days: number;
  byRole: [string, number][]; monthly: { month: string; count: number }[];
  seasons: { season: string; firstSeen: Date; postings: number }[];
};
const DAY = 86_400_000;
const seen = (j: TrendJob) => j.datePosted ?? j.firstDiscoveredAt;
const ym = (d: Date) => d.toISOString().slice(0, 7);

export function monthlyCounts(dates: Date[], months: number, now: Date): { month: string; count: number }[] {
  const out: { month: string; count: number }[] = [];
  for (let i = months - 1; i >= 0; i--) out.push({ month: ym(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))), count: 0 });
  const idx = new Map(out.map((m, i) => [m.month, i]));
  for (const d of dates) { const i = idx.get(ym(d)); if (i !== undefined) out[i].count++; }
  return out;
}

export function summarizeCompany(jobs: TrendJob[], now: Date): CompanySummary {
  const open = jobs.filter((j) => j.status === "OPEN");
  const roles = new Map<string, number>();
  for (const j of jobs) roles.set(j.roleCategory, (roles.get(j.roleCategory) ?? 0) + 1);
  const seasons = new Map<string, { season: string; firstSeen: Date; postings: number }>();
  for (const j of jobs) {
    if (!j.targetSeason || !j.targetYear || j.experienceLevel !== "INTERNSHIP") continue;
    const key = `${j.targetSeason} ${j.targetYear}`, when = seen(j), cur = seasons.get(key);
    if (!cur) seasons.set(key, { season: key, firstSeen: when, postings: 1 });
    else { cur.postings++; if (when < cur.firstSeen) cur.firstSeen = when; }
  }
  return {
    total: jobs.length, open: open.length,
    openEntryLevel: open.filter((j) => ["INTERNSHIP", "NEW_GRAD", "ENTRY_LEVEL"].includes(j.experienceLevel)).length,
    last30Days: jobs.filter((j) => now.getTime() - j.firstDiscoveredAt.getTime() <= 30 * DAY).length,
    byRole: [...roles.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    monthly: monthlyCounts(jobs.map((j) => j.firstDiscoveredAt), 12, now),
    seasons: [...seasons.values()].sort((a, b) => a.firstSeen.getTime() - b.firstSeen.getTime()),
  };
}
