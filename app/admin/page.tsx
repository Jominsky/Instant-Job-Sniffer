import { prisma } from "@/lib/db";
import { SCANNABLE_ATS } from "@/lib/ats";
import { relTime } from "@/lib/format";

export const dynamic = "force-dynamic";
const INTERVALS: Record<string, number> = {
  P0: +(process.env.SCAN_INTERVAL_P0_SECONDS ?? 300), P1: +(process.env.SCAN_INTERVAL_P1_SECONDS ?? 900),
  P2: +(process.env.SCAN_INTERVAL_P2_SECONDS ?? 2700), P3: +(process.env.SCAN_INTERVAL_P3_SECONDS ?? 10800),
};

export default async function Admin() {
  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const [total, active, failing, scannable, lastRun, runs24, perSource, recent, failingList] = await Promise.all([
    prisma.company.count(), prisma.company.count({ where: { isActive: true } }),
    prisma.company.count({ where: { isActive: true, consecutiveFailures: { gt: 0 } } }),
    prisma.company.count({ where: { isActive: true, atsProvider: { in: [...SCANNABLE_ATS] } } }),
    prisma.scanRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.scanRun.groupBy({ by: ["connector", "status"], where: { startedAt: { gte: dayAgo } }, _count: true, _sum: { jobsNew: true } }),
    prisma.job.groupBy({ by: ["source"], _count: true }),
    prisma.scanRun.findMany({ orderBy: { startedAt: "desc" }, take: 25, include: { company: { select: { name: true } } } }),
    prisma.company.findMany({ where: { isActive: true, consecutiveFailures: { gt: 0 } }, orderBy: { consecutiveFailures: "desc" }, take: 20 }),
  ]);
  const failRuns = failingList.length
    ? await prisma.scanRun.findMany({ where: { companyId: { in: failingList.map((c) => c.id) }, status: "FAILURE" }, orderBy: { startedAt: "desc" }, select: { companyId: true, errorMessage: true } })
    : [];
  const lastError = new Map<string, string | null>();
  for (const r of failRuns) if (!lastError.has(r.companyId)) lastError.set(r.companyId, r.errorMessage);
  const succeeded = await prisma.company.count({ where: { isActive: true, consecutiveFailures: 0, lastSuccessfulScanAt: { not: null } } });
  const nextDue = (await prisma.company.findMany({ where: { isActive: true, atsProvider: { in: [...SCANNABLE_ATS] } }, select: { priority: true, lastCheckedAt: true, consecutiveFailures: true } }))
    .map((c) => c.lastCheckedAt ? c.lastCheckedAt.getTime() + Math.min(INTERVALS[c.priority] * 2 ** Math.min(c.consecutiveFailures, 6), 6 * 3600) * 1000 : 0).sort((a, b) => a - b)[0];
  const stat = (l: string, v: React.ReactNode, bad = false) => <div className="card p-4"><div className="text-xs muted">{l}</div><div className="text-2xl font-semibold" style={bad ? { color: "hsl(var(--danger))" } : undefined}>{v}</div></div>;

  const health: Record<string, { ok: number; fail: number; neu: number }> = {};
  for (const r of runs24) { const h = (health[r.connector] ??= { ok: 0, fail: 0, neu: 0 }); if (r.status === "SUCCESS") { h.ok += r._count; h.neu += r._sum.jobsNew ?? 0; } else if (r.status === "FAILURE") h.fail += r._count; }

  return (
    <div className="page">
      <h1 className="h1">Diagnostics</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stat("Companies monitored", `${active} / ${total}`)}{stat("Scannable (have connector)", scannable)}
        {stat("Scanned successfully", succeeded)}{stat("With scan errors", failing, failing > 0)}
        {stat("Last scan", lastRun ? relTime(lastRun.startedAt) : "never")}
      </div>
      <div className="text-sm muted">Next scan due: {nextDue === undefined ? "—" : nextDue <= Date.now() ? "now (scheduler picks it up on its next 30s tick)" : new Date(nextDue).toLocaleTimeString()}
        {!lastRun && " · No scans have run yet — start the worker: npm run worker:scan"}</div>

      <section className="card space-y-2 p-4"><h2 className="h2">Source health (last 24h)</h2>
        <table className="w-full text-sm"><thead className="text-left text-xs muted"><tr><th>Connector</th><th>OK scans</th><th>Failed</th><th>New jobs</th><th>Total jobs stored</th></tr></thead><tbody>
          {Object.entries(health).map(([k, h]) => <tr key={k}><td className="py-1 font-medium">{k}</td><td>{h.ok}</td><td style={h.fail ? { color: "hsl(var(--danger))" } : undefined}>{h.fail}</td><td>{h.neu}</td><td>{perSource.find((p) => p.source === k)?._count ?? 0}</td></tr>)}
          {Object.keys(health).length === 0 && <tr><td colSpan={5} className="py-3 muted">No scan activity in the last 24 hours.</td></tr>}</tbody></table></section>

      {failingList.length > 0 && <section className="card space-y-2 p-4"><h2 className="h2" style={{ color: "hsl(var(--danger))" }}>Persistent failures</h2>
        {failingList.map((c) => (
          <div key={c.id} className="text-sm"><b>{c.name}</b> <span className="badge badge-danger">{c.consecutiveFailures} in a row</span>{" "}
            <span className="muted">backing off · {lastError.get(c.id)?.slice(0, 160)}</span></div>
        ))}</section>}

      <section className="card overflow-x-auto p-4"><h2 className="h2 mb-2">Recent scan runs</h2>
        <table className="w-full text-sm"><thead className="text-left text-xs muted"><tr><th>When</th><th>Company</th><th>Connector</th><th>Status</th><th>Found</th><th>New</th><th>Updated</th><th>Closed</th><th>Error</th></tr></thead><tbody>
          {recent.map((r) => <tr key={r.id}><td className="py-1 text-xs">{relTime(r.startedAt)}</td><td>{r.company.name}</td><td>{r.connector}</td><td><span className={`badge ${r.status === "SUCCESS" ? "badge-success" : r.status === "FAILURE" ? "badge-danger" : "badge-warning"}`}>{r.status.toLowerCase()}</span></td>
            <td>{r.jobsFound}</td><td>{r.jobsNew}</td><td>{r.jobsUpdated}</td><td>{r.jobsClosed}</td><td className="max-w-xs truncate text-xs muted">{r.errorMessage}</td></tr>)}</tbody></table></section>
    </div>
  );
}
