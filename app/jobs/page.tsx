import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { queryJobs, companySummary, Filters } from "@/lib/jobs";
import { parseSearch } from "@/lib/searchQuery";
import { SavedSearches } from "@/components/SavedSearches";
import { JobCard } from "@/components/JobCard";
import { FilterBar } from "@/components/FilterBar";

export default async function JobsPage({ searchParams }: { searchParams: Filters }) {
  const userId = await requireUserId();
  const parsed = parseSearch(searchParams.q);
  const [{ jobs, total, page, pages }, companies, savedRows, byCompany] = await Promise.all([
    queryJobs(searchParams, userId),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.savedSearch.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    parsed.wantsCompanies ? companySummary(searchParams, userId) : Promise.resolve([]),
  ]);
  const saved = savedRows.map((s) => ({ id: s.id, name: s.name, href: `/jobs?${new URLSearchParams((s.filterJson ?? {}) as Record<string, string>).toString()}` }));
  const current = Object.fromEntries(Object.entries(searchParams).filter(([, v]) => typeof v === "string" && v !== "")) as Record<string, string>;
  const active = Object.keys(current).some((k) => !["page", "sort", "status"].includes(k));
  const qs = (p: number) => new URLSearchParams({ ...(searchParams as Record<string, string>), page: String(p) }).toString();
  return (
    <div className="page">
      <div className="flex items-end justify-between"><h1 className="h1">All Jobs</h1><span className="flex items-center gap-3 text-sm muted">{total.toLocaleString()} results<a className="btn" href={`/api/jobs/export?${new URLSearchParams(current).toString()}`}>Export CSV</a></span></div>
      <FilterBar f={searchParams} companies={companies} />
      {parsed.explained.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs"><span className="muted">Understood as:</span>
          {parsed.explained.map((e) => <span key={e} className="badge">{e}</span>)}
          {parsed.terms.map((t) => <span key={t} className="badge">text: {t}</span>)}</div>
      )}
      <SavedSearches saved={saved} current={current} active={active} />
      {byCompany.length > 0 && (
        <div className="card space-y-2 p-4"><h2 className="h2">Companies with matches</h2>
          <div className="flex flex-wrap gap-2">{byCompany.map((c) => (
            <Link key={c.id} className="badge badge-primary" href={`/jobs?${new URLSearchParams({ ...current, companyId: c.id }).toString()}`}>{c.name} · {c.count}</Link>))}</div></div>
      )}
      <div className="space-y-3">
        {jobs.map((j) => <JobCard key={j.id} job={JSON.parse(JSON.stringify(j))} />)}
        {jobs.length === 0 && (
          <div className="card p-8 text-center text-sm muted">
            No jobs match. {total === 0 && <>Add companies on the <Link className="underline" href="/companies">Companies</Link> page and run the worker (<code>npm run worker:scan</code>).</>}
          </div>
        )}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && <Link className="btn" href={`/jobs?${qs(page - 1)}`}>Previous</Link>}
          <span className="muted">Page {page} of {pages}</span>
          {page < pages && <Link className="btn" href={`/jobs?${qs(page + 1)}`}>Next</Link>}
        </div>
      )}
    </div>
  );
}
