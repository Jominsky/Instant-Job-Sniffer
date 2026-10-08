import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { NewWatchlist } from "@/components/WatchlistEditor";
import { describeRule, ruleToWhere, RuleSchema } from "@/lib/rules";

export default async function Watchlists() {
  const userId = await requireUserId();
  const [lists, companies] = await Promise.all([
    prisma.watchlist.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const names = Object.fromEntries(companies.map((c) => [c.id, c.name]));
  const day = new Date(Date.now() - 24 * 3600_000);
  const rows = await Promise.all(lists.map(async (l) => {
    const rule = RuleSchema.safeParse(l.filterJson); const r = rule.success ? rule.data : {};
    const where = { AND: [{ status: "OPEN" as const, isExcluded: false }, ruleToWhere(r)] };
    const [open, fresh] = await Promise.all([prisma.job.count({ where }), prisma.job.count({ where: { AND: [where, { firstDiscoveredAt: { gte: day } }] } })]);
    return { l, desc: describeRule(r, names), open, fresh };
  }));
  return (
    <div className="page">
      <div className="flex items-end justify-between"><div><h1 className="h1">Watchlists</h1><p className="text-sm muted">Saved views with their own feed and optional notification rules.</p></div></div>
      <NewWatchlist companies={companies} />
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map(({ l, desc, open, fresh }) => (
          <Link key={l.id} href={`/watchlists/${l.id}`} className="card space-y-1 p-4 hover:border-[hsl(var(--primary)/.5)]">
            <div className="flex items-center justify-between"><b>{l.name}</b>{fresh > 0 && <span className="badge badge-danger">{fresh} new</span>}</div>
            <div className="text-xs muted">{desc}</div><div className="text-xs">{open} open jobs</div></Link>))}
        {rows.length === 0 && <div className="card p-6 text-center text-sm muted md:col-span-2">No watchlists yet. Try “Quant” (category: prop trading, hedge fund, quant) or “NYC” (location: New York).</div>}
      </div>
    </div>
  );
}
