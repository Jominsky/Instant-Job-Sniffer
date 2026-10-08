import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { queryJobs } from "@/lib/jobs";
import { JobCard } from "@/components/JobCard";
import { StatusBadge } from "@/components/Badges";
import { relTime } from "@/lib/format";
import { buildReminders } from "@/lib/reminders";

export default async function Dashboard() {
  const userId = await requireUserId();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const [companyCount, strongToday, apply, opened, targets, deadlines, pipeline, trackedApps, pendingReferrals] = await Promise.all([
    prisma.company.count(),
    queryJobs({ minFit: "80", discoveredWithin: String(Math.ceil((Date.now() - start.getTime()) / 60000)), applied: "0" }, userId, 1),
    queryJobs({ applied: "0", minFit: "60", sort: "best_match", exp: undefined }, userId, 6),
    queryJobs({ discoveredWithin: "180", applied: "0" }, userId, 4),
    prisma.company.findMany({
      where: { priority: { in: ["P0", "P1"] }, jobs: { some: { firstDiscoveredAt: { gte: new Date(Date.now() - 7 * 86400_000) }, status: "OPEN", isExcluded: false } } },
      select: { id: true, name: true, priority: true, jobs: { where: { firstDiscoveredAt: { gte: new Date(Date.now() - 7 * 86400_000) }, status: "OPEN", isExcluded: false },
        select: { id: true, title: true, firstDiscoveredAt: true }, orderBy: { firstDiscoveredAt: "desc" }, take: 3 } },
      orderBy: { priority: "asc" }, take: 8 }),
    prisma.job.findMany({ where: { status: "OPEN", applicationDeadline: { gte: new Date(), lte: new Date(Date.now() + 14 * 86400_000) }, isExcluded: false },
      include: { company: { select: { name: true } } }, orderBy: { applicationDeadline: "asc" }, take: 6 }),
    prisma.application.groupBy({ by: ["status"], where: { userId, status: { notIn: ["DISCOVERED"] } }, _count: true }),
    prisma.application.findMany({ where: { userId, status: { notIn: ["DISCOVERED", "INTERESTED", "SAVED", "REJECTED", "WITHDRAWN"] } },
      select: { jobId: true, status: true, dateApplied: true, followUpDate: true, oaDeadline: true, interviewDates: true, job: { select: { title: true, company: { select: { name: true } } } } } }),
    prisma.contact.findMany({ where: { userId, referralRequested: true, referralReceived: false },
      select: { id: true, name: true, referralRequested: true, referralReceived: true, lastContactedAt: true, createdAt: true, company: { select: { name: true } } } }),
  ]);
  const reminders = buildReminders(new Date(),
    trackedApps.map((a) => ({ jobId: a.jobId, title: a.job.title, company: a.job.company.name, status: a.status, dateApplied: a.dateApplied, followUpDate: a.followUpDate, oaDeadline: a.oaDeadline, interviewDates: a.interviewDates })),
    pendingReferrals.map((c) => ({ id: c.id, name: c.name, company: c.company?.name ?? null, referralRequested: c.referralRequested, referralReceived: c.referralReceived, lastContactedAt: c.lastContactedAt, createdAt: c.createdAt })));
  return (
    <div className="page">
      <div className="card flex items-center justify-between p-5">
        <div>
          <div className="text-2xl font-semibold tracking-tight">{strongToday.total} new strong {strongToday.total === 1 ? "match" : "matches"} today</div>
          <div className="text-sm muted">80+ fit, discovered today, not yet applied</div>
        </div>
        <Link href="/just-opened?fit=80&w=today" className="btn btn-primary">Review now</Link>
      </div>

      {reminders.length > 0 && (
        <section className="card space-y-2 p-4">
          <h2 className="h2">Needs your attention</h2>
          {reminders.slice(0, 8).map((r, i) => (
            <div key={`${r.kind}-${i}`} className="flex items-start justify-between gap-3 text-sm">
              <div><Link href={r.href} className="font-medium hover:underline">{r.title}</Link><div className="text-xs muted">{r.detail}</div></div>
              <span className={`badge ${r.severity === "overdue" ? "badge-danger" : r.severity === "soon" ? "badge-warning" : ""}`}>{r.severity === "info" ? "FYI" : r.severity}</span>
            </div>))}
          {reminders.length > 8 && <p className="text-xs muted">+ {reminders.length - 8} more. Open the Applications page to see everything.</p>}
        </section>
      )}

      {companyCount === 0 && (
        <div className="card p-5 text-sm">
          <b>Get started:</b> import companies on the <Link className="underline" href="/companies">Companies</Link> page (a starter list is included in the seed), then run <code>npm run worker:scan</code> to pull in jobs.
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="h2">High Priority — Apply Now</h2><Link className="text-xs underline muted" href="/jobs?applied=0&sort=best_match">See all</Link></div>
        {apply.jobs.map((j) => <JobCard key={j.id} job={JSON.parse(JSON.stringify(j))} />)}
        {apply.jobs.length === 0 && <div className="card p-6 text-center text-sm muted">No un-applied matches yet.</div>}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="h2">Just Opened</h2><Link className="text-xs underline muted" href="/just-opened">See all</Link></div>
        {opened.jobs.map((j) => <JobCard key={j.id} job={JSON.parse(JSON.stringify(j))} />)}
        {opened.jobs.length === 0 && <div className="card p-6 text-center text-sm muted">Nothing in the last 3 hours.</div>}
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card space-y-2 p-4">
          <h2 className="h2">Target Companies With New Roles</h2>
          {targets.map((c) => (
            <div key={c.id} className="text-sm"><Link href={`/jobs?companyId=${c.id}`} className="font-medium hover:underline">{c.name}</Link> <span className="badge">{c.priority}</span>
              <ul className="ml-3 list-disc text-xs muted">{c.jobs.map((j) => <li key={j.id}><Link href={`/jobs/${j.id}`} className="hover:underline">{j.title}</Link> · {relTime(j.firstDiscoveredAt)}</li>)}</ul></div>
          ))}
          {targets.length === 0 && <p className="text-sm muted">No P0/P1 company activity this week.</p>}
        </section>
        <section className="card space-y-2 p-4">
          <h2 className="h2">Upcoming Deadlines</h2>
          {deadlines.map((j) => <div key={j.id} className="flex justify-between text-sm"><Link href={`/jobs/${j.id}`} className="hover:underline">{j.company.name} — {j.title}</Link>
            <span className="badge badge-warning">{j.applicationDeadline!.toLocaleDateString()}</span></div>)}
          {deadlines.length === 0 && <p className="text-sm muted">No deadlines in the next 14 days (only shown when the employer publishes one).</p>}
        </section>
      </div>

      <section className="card space-y-2 p-4">
        <div className="flex items-center justify-between"><h2 className="h2">Application Pipeline</h2><Link className="text-xs underline muted" href="/applications?view=kanban">Open board</Link></div>
        <div className="flex flex-wrap gap-2">
          {pipeline.map((p) => <div key={p.status} className="flex items-center gap-1.5 text-sm"><StatusBadge status={p.status} /><b>{p._count}</b></div>)}
          {pipeline.length === 0 && <p className="text-sm muted">No tracked applications yet — hit Save or Apply on a job.</p>}
        </div>
      </section>
    </div>
  );
}
