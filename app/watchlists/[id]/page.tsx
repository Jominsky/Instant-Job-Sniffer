import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { queryJobs, Filters } from "@/lib/jobs";
import { JobCard } from "@/components/JobCard";
import { EditWatchlist } from "@/components/WatchlistEditor";
import { describeRule, ruleToWhere, RuleSchema } from "@/lib/rules";

export default async function WatchlistPage({ params, searchParams }: { params: { id: string }; searchParams: Filters }) {
  const userId = await requireUserId();
  const list = await prisma.watchlist.findFirst({ where: { id: params.id, userId } });
  if (!list) notFound();
  const parsed = RuleSchema.safeParse(list.filterJson); const rule = parsed.success ? parsed.data : {};
  const [companies, { jobs, total, page, pages }] = await Promise.all([
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    queryJobs({ sort: "newest_discovered", ...searchParams }, userId, 25, ruleToWhere(rule)),
  ]);
  const names = Object.fromEntries(companies.map((c) => [c.id, c.name]));
  return (
    <div className="page">
      <div><Link href="/watchlists" className="text-xs underline muted">← Watchlists</Link><h1 className="h1">{list.name}</h1><p className="text-sm muted">{describeRule(rule, names)} · {total} open jobs</p></div>
      <EditWatchlist id={list.id} name={list.name} rule={rule} companies={companies} />
      <div className="flex gap-2 text-xs">{[["newest_discovered", "Newest"], ["best_match", "Best match"], ["company_priority", "Company priority"]].map(([v, l]) =>
        <Link key={v} className={`btn ${(searchParams.sort ?? "newest_discovered") === v ? "btn-primary" : ""}`} href={`/watchlists/${list.id}?sort=${v}`}>{l}</Link>)}</div>
      <div className="space-y-3">{jobs.map((j) => <JobCard key={j.id} job={JSON.parse(JSON.stringify(j))} />)}
        {jobs.length === 0 && <div className="card p-8 text-center text-sm muted">No open jobs match this watchlist yet.</div>}</div>
      {pages > 1 && <div className="flex justify-center gap-2 text-sm">{page > 1 && <Link className="btn" href={`/watchlists/${list.id}?page=${page - 1}`}>Previous</Link>}{page < pages && <Link className="btn" href={`/watchlists/${list.id}?page=${page + 1}`}>Next</Link>}</div>}
    </div>
  );
}
