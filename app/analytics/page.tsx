import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { funnel, weeklyBuckets, topCounts, avgDelayHours, fmtDelay, isSubmitted, type AppFacts } from "@/lib/analytics";
import { ROLE_LABELS, CATEGORY_LABELS, relTime } from "@/lib/format";
import Link from "next/link";
import { payGroups, fmtPay, fmtRange, PERIOD_LABEL, PERIOD_ORDER, type PayGroup } from "@/lib/pay";

export const dynamic = "force-dynamic";

function Bars({ rows, empty = "No data yet" }: { rows: { label: string; count: number }[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <p className="text-xs muted">{empty}</p>;
  return <div className="space-y-1.5">{rows.map((r) => (
    <div key={r.label} className="flex items-center gap-2 text-xs"><span className="w-32 shrink-0 truncate">{r.label}</span>
      <div className="h-2 flex-1 rounded-full bg-[hsl(var(--muted))]"><div className="h-2 rounded-full bg-[hsl(var(--primary))]" style={{ width: `${(r.count / max) * 100}%` }} /></div><b className="w-6 text-right">{r.count}</b></div>))}</div>;
}
const Stat = ({ l, v, sub }: { l: string; v: React.ReactNode; sub?: string }) => <div className="card p-4"><div className="text-xs muted">{l}</div><div className="text-2xl font-semibold">{v}</div>{sub && <div className="text-[11px] muted">{sub}</div>}</div>;
function PayTable({ title, groups }: { title: string; groups: PayGroup[] }) {
  const periods = PERIOD_ORDER.filter((p) => groups.some((g) => g.period === p));
  return (
    <section className="card space-y-3 p-4"><h2 className="h2">{title}</h2>
      {periods.length === 0 && <p className="text-xs muted">No postings with parsed pay yet. Pay is only shown when the employer states it.</p>}
      {periods.map((p) => (
        <div key={p}><div className="mb-1 text-xs font-medium muted">{PERIOD_LABEL[p]}</div>
          <table className="w-full text-xs"><tbody>
            {groups.filter((g) => g.period === p).slice(0, 8).map((g) => (
              <tr key={g.key} className="border-t" style={{ borderColor: "hsl(var(--border))" }}>
                <td className="py-1 pr-2">{g.key}</td><td className="muted">{g.n} posting{g.n === 1 ? "" : "s"}</td>
                <td className="text-right font-medium">{fmtPay(g.median, p)}</td><td className="text-right muted">{g.low === g.high ? "" : fmtRange(g.low, g.high, p)}</td></tr>))}
          </tbody></table></div>))}
    </section>
  );
}
const pct = (x: number | null) => (x == null ? "—" : `${x}%`);

export default async function Analytics() {
  const userId = await requireUserId();
  const now = Date.now(); const start = new Date(); start.setHours(0, 0, 0, 0);
  const week = new Date(now - 7 * 86400_000); const month = new Date(now - 30 * 86400_000);
  const base = { status: "OPEN" as const, isExcluded: false };
  const [today, thisWeek, openInterns, strong30, apps, activeCos, recent, payJobs] = await Promise.all([
    prisma.job.count({ where: { firstDiscoveredAt: { gte: start }, isExcluded: false } }),
    prisma.job.count({ where: { firstDiscoveredAt: { gte: week }, isExcluded: false } }),
    prisma.job.count({ where: { ...base, experienceLevel: "INTERNSHIP" } }),
    prisma.job.count({ where: { firstDiscoveredAt: { gte: month }, isExcluded: false, fitScore: { gte: 70 } } }),
    prisma.application.findMany({ where: { userId }, include: { statusHistory: { select: { status: true } },
      job: { select: { firstDiscoveredAt: true, roleCategory: true, location: true, company: { select: { name: true, industry: true, category: true } } } } } }),
    prisma.job.groupBy({ by: ["companyId"], where: { ...base, firstDiscoveredAt: { gte: week }, fitScore: { gte: 60 }, experienceLevel: { in: ["INTERNSHIP", "NEW_GRAD", "ENTRY_LEVEL"] } }, _count: true, orderBy: { _count: { companyId: "desc" } }, take: 8 }),
    prisma.job.groupBy({ by: ["companyId"], where: { firstDiscoveredAt: { gte: week }, isExcluded: false }, _max: { firstDiscoveredAt: true }, _count: true, orderBy: { _max: { firstDiscoveredAt: "desc" } }, take: 8 }),
    prisma.job.findMany({ where: { isExcluded: false, status: "OPEN", compensationMax: { not: null } }, take: 3000,
      select: { compensationMin: true, compensationMax: true, compensationPeriod: true, roleCategory: true, company: { select: { name: true } } } }),
  ]);
  const names = new Map((await prisma.company.findMany({ where: { id: { in: [...activeCos, ...recent].map((c) => c.companyId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));

  const facts = apps.map((a) => ({ a, f: { status: a.status, dateApplied: a.dateApplied, history: a.statusHistory.map((h) => h.status) } as AppFacts }));
  const submitted = facts.filter((x) => isSubmitted(x.f));
  const F = funnel(facts.map((x) => x.f));
  const appliedStrong = await prisma.application.count({ where: { userId, job: { firstDiscoveredAt: { gte: month }, fitScore: { gte: 70 } }, OR: [{ dateApplied: { not: null } }, { status: { in: ["APPLIED", "OA_RECEIVED", "OA_COMPLETED", "RECRUITER_SCREEN", "TECHNICAL_INTERVIEW", "FINAL_ROUND", "OFFER"] } }] } });
  const delay = avgDelayHours(submitted.map((x) => ({ discovered: x.a.job.firstDiscoveredAt, applied: x.a.dateApplied })));

  return (
    <div className="page">
      <div><h1 className="h1">Analytics</h1><p className="text-sm muted">Funnel rates count an application once it reached a stage (“ever reached”), using your status history.</p></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat l="Jobs discovered today" v={today} /><Stat l="Discovered this week" v={thisWeek} /><Stat l="Open internships" v={openInterns} />
        <Stat l="Applications submitted" v={F.submitted} />
        <Stat l="Application rate" v={strong30 ? `${Math.round((appliedStrong / strong30) * 100)}%` : "—"} sub={`applied to ${appliedStrong} of ${strong30} strong matches (fit ≥ 70) found in 30 days`} />
        <Stat l="OA rate" v={pct(F.oaRate)} sub={`${F.oa} of ${F.submitted}`} /><Stat l="Interview rate" v={pct(F.interviewRate)} sub={`${F.interview} of ${F.submitted}`} />
        <Stat l="Offer rate" v={pct(F.offerRate)} sub={`${F.offer} of ${F.submitted}`} /><Stat l="Rejection rate" v={pct(F.rejectionRate)} sub={`${F.rejected} of ${F.submitted}`} />
        <Stat l="Avg. discovery → application" v={fmtDelay(delay)} sub="lower is better" />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="card space-y-2 p-4"><h2 className="h2">Applications over time (weekly)</h2><Bars rows={weeklyBuckets(submitted.map((x) => x.a.dateApplied ?? x.a.updatedAt), 12)} /></section>
        <section className="card space-y-2 p-4"><h2 className="h2">By company</h2><Bars rows={topCounts(submitted, (x) => x.a.job.company.name)} /></section>
        <section className="card space-y-2 p-4"><h2 className="h2">By role</h2><Bars rows={topCounts(submitted, (x) => ROLE_LABELS[x.a.job.roleCategory])} /></section>
        <section className="card space-y-2 p-4"><h2 className="h2">By industry</h2><Bars rows={topCounts(submitted, (x) => x.a.job.company.industry ?? CATEGORY_LABELS[x.a.job.company.category])} /></section>
        <section className="card space-y-2 p-4"><h2 className="h2">By location</h2><Bars rows={topCounts(submitted, (x) => x.a.job.location)} /></section>
        <section className="card space-y-2 p-4"><h2 className="h2">Companies opening the most relevant roles this week</h2>
          <Bars rows={activeCos.map((c) => ({ label: names.get(c.companyId) ?? "?", count: c._count }))} empty="None this week (relevant = fit ≥ 60, internship / new grad / entry level)" /></section>
      </div>
      <section className="card space-y-2 p-4"><h2 className="h2">Recently active employers</h2>
        {recent.map((c) => <div key={c.companyId} className="flex justify-between text-sm"><Link className="hover:underline" href={`/jobs?companyId=${c.companyId}`}>{names.get(c.companyId)}</Link><span className="muted">{c._count} new · last {relTime(c._max.firstDiscoveredAt)}</span></div>)}
        {recent.length === 0 && <p className="text-sm muted">No new postings this week.</p>}</section>
      <div className="grid gap-4 lg:grid-cols-2">
        <PayTable title="Pay by company" groups={payGroups(payJobs.map((j) => ({ key: j.company.name, period: j.compensationPeriod, min: j.compensationMin, max: j.compensationMax })))} />
        <PayTable title="Pay by role type" groups={payGroups(payJobs.map((j) => ({ key: (j.roleCategory ?? "OTHER").replace(/_/g, " ").toLowerCase(), period: j.compensationPeriod, min: j.compensationMin, max: j.compensationMax })))} />
      </div>
    </div>
  );
}
