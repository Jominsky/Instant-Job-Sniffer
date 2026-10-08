import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { queryJobs } from "@/lib/jobs";
import { summarizeCompany } from "@/lib/companyTrends";
import { payGroups, fmtPay, fmtRange, PERIOD_LABEL, PERIOD_ORDER } from "@/lib/pay";
import { JobCard } from "@/components/JobCard";
import { ROLE_LABELS, relTime } from "@/lib/format";

/** Company research page. Everything here is derived from postings this platform has actually seen, so history starts when scanning started. */
export default async function CompanyPage({ params }: { params: { id: string } }) {
  const userId = await requireUserId();
  const company = await prisma.company.findUnique({ where: { id: params.id } });
  if (!company) notFound();
  const [all, open, contacts] = await Promise.all([
    prisma.job.findMany({ where: { companyId: company.id, isExcluded: false }, select: { firstDiscoveredAt: true, datePosted: true, status: true, roleCategory: true, experienceLevel: true,
      targetSeason: true, targetYear: true, compensationMin: true, compensationMax: true, compensationPeriod: true } }),
    queryJobs({ companyId: company.id, status: "OPEN" }, userId, 15),
    prisma.contact.findMany({ where: { userId, companyId: company.id }, orderBy: { name: "asc" } }),
  ]);
  const s = summarizeCompany(all, new Date());
  const maxMonth = Math.max(1, ...s.monthly.map((m) => m.count)), maxRole = Math.max(1, ...s.byRole.map((r) => r[1]));
  const pay = payGroups(all.map((j) => ({ key: "all", period: j.compensationPeriod, min: j.compensationMin, max: j.compensationMax })));
  const Stat = ({ k, v }: { k: string; v: string | number }) => <div className="card p-3"><div className="text-xs muted">{k}</div><div className="text-xl font-semibold">{v}</div></div>;

  return (
    <div className="page space-y-5">
      <div className="space-y-1">
        <Link href="/companies" className="text-sm muted hover:underline">← Companies</Link>
        <h1 className="h1">{company.name}</h1>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="badge">{company.priority}</span><span className="badge">{company.category.replace(/_/g, " ").toLowerCase()}</span>
          {company.industry && <span className="badge">{company.industry}</span>}<span className="badge">{company.atsProvider.replace(/_/g, " ")}</span>
          {company.careersUrl && <a className="badge badge-primary" href={company.careersUrl} target="_blank" rel="noopener noreferrer">Careers page</a>}
          {company.website && <a className="badge" href={company.website} target="_blank" rel="noopener noreferrer">Website</a>}
        </div>
        <p className="text-xs muted">Last successful scan: {company.lastSuccessfulScanAt ? relTime(company.lastSuccessfulScanAt) : "never"}{company.consecutiveFailures > 0 && ` · ${company.consecutiveFailures} failed scans in a row`}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat k="Open roles" v={s.open} /><Stat k="Open entry-level / internship" v={s.openEntryLevel} /><Stat k="New in last 30 days" v={s.last30Days} /><Stat k="Seen in total" v={s.total} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card space-y-2 p-4"><h2 className="h2">Hiring activity, last 12 months</h2>
          <div className="flex h-24 items-end gap-1">{s.monthly.map((m) => (
            <div key={m.month} className="flex-1" title={`${m.month}: ${m.count}`}><div className="rounded-sm" style={{ height: `${(m.count / maxMonth) * 100}%`, minHeight: m.count ? 3 : 1, background: "hsl(var(--primary))" }} /></div>))}</div>
          <div className="flex justify-between text-[10px] muted"><span>{s.monthly[0]?.month}</span><span>{s.monthly[s.monthly.length - 1]?.month}</span></div>
        </section>
        <section className="card space-y-2 p-4"><h2 className="h2">Roles they hire for</h2>
          {s.byRole.length === 0 && <p className="text-sm muted">Nothing seen yet.</p>}
          {s.byRole.slice(0, 6).map(([role, n]) => (
            <div key={role} className="text-xs"><div className="flex justify-between"><span>{(ROLE_LABELS as Record<string, string>)[role] ?? role}</span><span className="muted">{n}</span></div>
              <div className="h-1.5 rounded" style={{ width: `${(n / maxRole) * 100}%`, background: "hsl(var(--primary))" }} /></div>))}
        </section>
        <section className="card space-y-2 p-4"><h2 className="h2">Internship / new-grad seasons seen</h2>
          {s.seasons.length === 0 && <p className="text-sm muted">No season-tagged postings seen yet.</p>}
          {s.seasons.map((x) => <div key={x.season} className="flex justify-between text-sm"><span>{x.season}</span><span className="muted">first seen {x.firstSeen.toLocaleDateString()} · {x.postings} posting{x.postings === 1 ? "" : "s"}</span></div>)}
          <p className="text-xs muted">Useful for guessing when applications may open next year. A guide only.</p>
        </section>
        <section className="card space-y-2 p-4"><h2 className="h2">Stated pay</h2>
          {pay.length === 0 && <p className="text-sm muted">No postings with stated pay.</p>}
          {PERIOD_ORDER.map((p) => pay.filter((g) => g.period === p).map((g) => (
            <div key={p} className="flex justify-between text-sm"><span>{PERIOD_LABEL[p]} <span className="text-xs muted">({g.n})</span></span><span>{fmtPay(g.median, p)} median <span className="text-xs muted">{fmtRange(g.low, g.high, p)}</span></span></div>)))}
        </section>
      </div>

      <section className="space-y-2"><h2 className="h2">Open roles ({s.open})</h2>
        {open.jobs.map((j) => <JobCard key={j.id} job={JSON.parse(JSON.stringify(j))} />)}
        {open.total > open.jobs.length && <Link className="text-sm underline" href={`/jobs?companyId=${company.id}`}>See all {open.total} open roles</Link>}
        {open.total === 0 && <p className="text-sm muted">No open roles right now.</p>}
      </section>

      <section className="card space-y-2 p-4"><h2 className="h2">Your contacts here</h2>
        {contacts.map((c) => <div key={c.id} className="text-sm">{c.name}{c.position ? ` — ${c.position}` : ""}</div>)}
        <Link className="text-xs underline muted" href={`/contacts?companyId=${company.id}`}>{contacts.length ? "Manage contacts" : "Add a contact"}</Link>
      </section>
      <p className="text-xs muted">Based only on postings this platform has seen since it started watching {company.name}. It does not know about roles posted elsewhere or earlier.</p>
    </div>
  );
}
