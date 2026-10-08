import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { AlertsManager } from "@/components/AlertsManager";
import { describeRule, RuleSchema } from "@/lib/rules";
import { relTime } from "@/lib/format";

export default async function AlertsPage() {
  const userId = await requireUserId();
  const [alerts, companies, watchlists, events] = await Promise.all([
    prisma.alert.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, include: { watchlist: { select: { name: true } }, _count: { select: { events: { where: { status: "SENT" } } } } } }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.watchlist.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.alertEvent.findMany({ where: { alert: { userId } }, orderBy: { createdAt: "desc" }, take: 15, include: { alert: { select: { name: true } } } }),
  ]);
  const jobs = await prisma.job.findMany({ where: { id: { in: events.map((e) => e.jobId) } }, select: { id: true, title: true, company: { select: { name: true } } } });
  const jm = new Map(jobs.map((j) => [j.id, j]));
  const names = Object.fromEntries(companies.map((c) => [c.id, c.name]));
  const rows = alerts.map((a) => ({ id: a.id, name: a.name, channels: a.channels as string[], frequency: a.frequency, isActive: a.isActive, watchlist: a.watchlist?.name ?? null,
    sent: a._count.events, desc: (() => { const p = RuleSchema.safeParse(a.ruleJson); return p.success ? describeRule(p.data, names) : "(invalid rule)"; })() }));
  return (
    <div className="page">
      <div><h1 className="h1">Alerts</h1><p className="text-sm muted">Each job notifies each alert at most once. Adding a new company never floods you: on its first scan only jobs posted in the last few hours can alert.</p></div>
      <AlertsManager alerts={rows} companies={companies} watchlists={watchlists} />
      <section className="card space-y-2 p-4"><h2 className="h2">Recent alert activity</h2>
        {events.map((e) => { const j = jm.get(e.jobId); return (
          <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{j ? `${j.company.name} — ${j.title}` : "(job removed)"} <span className="muted">· {e.alert.name} · {e.reason}</span></span>
            <span className="flex items-center gap-2 text-xs muted">{relTime(e.createdAt)}<span className={`badge ${e.status === "SENT" ? "badge-success" : e.status === "FAILED" ? "badge-danger" : "badge-warning"}`}>{e.status.toLowerCase()}</span></span></div>); })}
        {events.length === 0 && <p className="text-sm muted">Nothing yet.</p>}</section>
    </div>
  );
}
