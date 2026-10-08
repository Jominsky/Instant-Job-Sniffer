"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bookmark, X, ExternalLink } from "lucide-react";
import { relTime, isFresh, ROLE_LABELS, EXP_LABELS, label } from "@/lib/format";
import { FitBadge, StatusBadge } from "@/components/Badges";

export type JobCardData = {
  id: string; title: string; location: string | null; workMode: string; roleCategory: string; experienceLevel: string;
  fitScore: number | null; datePosted: string | Date | null; firstDiscoveredAt: string | Date; lastUpdatedAt: string | Date;
  version: number; applicationUrl: string; source: string; compensationRaw: string | null; targetSeason: string | null;
  targetYear: number | null; seasonProvenance: string; status: string; isSaved?: boolean; applicationStatus?: string | null; hasReferral?: boolean; priority?: string;
  technologies: string[]; company: { id: string; name: string; logoUrl: string | null; priority: string };
};

export function JobCard({ job }: { job: JobCardData }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [saved, setSaved] = useState(!!job.isSaved);
  const [hidden, setHidden] = useState(false);
  const [priority, setPriority] = useState(job.priority ?? "NORMAL");

  function act(action: "save" | "unsave" | "not_interested" | "applying") {
    if (action === "save") setSaved(true);
    if (action === "unsave") setSaved(false);
    if (action === "not_interested") setHidden(true);
    start(async () => {
      await fetch(`/api/jobs/${job.id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      router.refresh();
    });
  }
  function changePriority(p: string) {
    setPriority(p); if (p !== "NORMAL") setSaved(true);
    start(async () => {
      await fetch(`/api/jobs/${job.id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "priority", priority: p }) });
      router.refresh();
    });
  }
  if (hidden) return null;
  const updated = job.version > 1 && isFresh(job.lastUpdatedAt, 72);
  return (
    <div className="card flex flex-col gap-2.5 p-4 transition-colors hover:border-[hsl(var(--primary)/.5)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[hsl(var(--muted))] text-sm font-semibold">
            {job.company.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={job.company.logoUrl} alt="" className="h-9 w-9 object-contain" /> : job.company.name[0]}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link href={`/jobs/${job.id}`} className="truncate text-sm font-semibold hover:underline">{job.title}</Link>
              {isFresh(job.firstDiscoveredAt) && <span className="badge badge-danger">New</span>}
              {updated && <span className="badge badge-warning">Updated {relTime(job.lastUpdatedAt)}</span>}
              {job.status !== "OPEN" && <StatusBadge status={job.status} />}
              {job.hasReferral && <span className="badge badge-primary">Referral available</span>}
            </div>
            <div className="text-sm muted"><Link href={`/companies/${job.company.id}`} className="hover:underline">{job.company.name}</Link> · {job.company.priority}</div>
          </div>
        </div>
        <FitBadge score={job.fitScore} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="badge">{ROLE_LABELS[job.roleCategory]}</span>
        <span className="badge">{EXP_LABELS[job.experienceLevel]}</span>
        {job.location && <span className="badge">{job.location}</span>}
        {job.workMode !== "UNKNOWN" && <span className="badge">{label(job.workMode)}</span>}
        {job.targetYear && <span className="badge" title={job.seasonProvenance === "ATS" ? "Stated in posting" : "Inferred, not stated by employer"}>
          {job.seasonProvenance === "ATS" ? "" : "Likely "}{job.targetSeason ?? ""} {job.targetYear}</span>}
        {job.compensationRaw && <span className="badge">{job.compensationRaw}</span>}
        {job.technologies.slice(0, 4).map((t) => <span key={t} className="badge badge-primary">{t}</span>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs muted">
          Discovered {relTime(job.firstDiscoveredAt)}{job.datePosted ? ` · Posted ${relTime(job.datePosted)}` : ""} · <span className="uppercase">{job.source}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {job.applicationStatus && !["DISCOVERED"].includes(job.applicationStatus) && <StatusBadge status={job.applicationStatus} />}
          <select className="input w-auto py-1 text-xs" aria-label="My priority for this job" value={priority} onChange={(e) => changePriority(e.target.value)}>
            <option value="HIGH">High priority</option><option value="NORMAL">Normal</option><option value="LOW">Low priority</option></select>
          <button className="btn" title={saved ? "Unsave" : "Save"} onClick={() => act(saved ? "unsave" : "save")}><Bookmark className="h-3.5 w-3.5" fill={saved ? "currentColor" : "none"} /></button>
          <button className="btn" title="Not interested" onClick={() => act("not_interested")}><X className="h-3.5 w-3.5" /></button>
          <Link className="btn" href={`/jobs/${job.id}`}>Details</Link>
          <a className="btn btn-primary" href={job.applicationUrl} target="_blank" rel="noopener noreferrer" onClick={() => act("applying")}>Apply <ExternalLink className="h-3 w-3" /></a>
        </div>
      </div>
    </div>
  );
}
