import Link from "next/link";
import clsx from "clsx";
import { requireUserId } from "@/lib/session";
import { queryJobs } from "@/lib/jobs";
import { JobCard } from "@/components/JobCard";
import { AutoRefresh } from "@/components/AutoRefresh";

const WINDOWS: [string, string][] = [["15", "Last 15 min"], ["60", "Last hour"], ["180", "Last 3 hours"], ["today", "Today"], ["1440", "Last 24 hours"], ["4320", "Last 3 days"]];

export default async function JustOpened({ searchParams }: { searchParams: { w?: string; fit?: string } }) {
  const userId = await requireUserId();
  const w = searchParams.w ?? "180";
  const minutes = w === "today" ? Math.max(1, Math.ceil((Date.now() - new Date().setHours(0, 0, 0, 0)) / 60000)) : Number(w);
  const { jobs, total } = await queryJobs({ discoveredWithin: String(minutes), sort: "newest_discovered", applied: "0", minFit: searchParams.fit }, userId, 50);
  return (
    <div className="page">
      <AutoRefresh seconds={30} />
      <div className="flex items-end justify-between"><div><h1 className="h1">Just Opened</h1><p className="text-sm muted">Newest postings first · refreshes every 30s · already-applied jobs hidden</p></div>
        <span className="text-sm muted">{total} found</span></div>
      <div className="flex flex-wrap gap-2">
        {WINDOWS.map(([v, l]) => <Link key={v} href={`/just-opened?w=${v}${searchParams.fit ? `&fit=${searchParams.fit}` : ""}`} className={clsx("btn", w === v && "btn-primary")}>{l}</Link>)}
        <Link href={`/just-opened?w=${w}&fit=${searchParams.fit ? "" : "80"}`} className={clsx("btn", searchParams.fit && "btn-primary")}>Strong matches (80+)</Link>
      </div>
      <div className="space-y-3">
        {jobs.map((j) => <JobCard key={j.id} job={JSON.parse(JSON.stringify(j))} />)}
        {jobs.length === 0 && <div className="card p-8 text-center text-sm muted">Nothing discovered in this window. Try a wider range, or check <Link className="underline" href="/admin">Diagnostics</Link> to confirm scans are running.</div>}
      </div>
    </div>
  );
}
