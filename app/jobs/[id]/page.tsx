import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { FitBadge, StatusBadge } from "@/components/Badges";
import { ApplicationPanel } from "@/components/ApplicationPanel";
import { DraftPanel } from "@/components/DraftPanel";
import { relTime, discoveryKind, ROLE_LABELS, EXP_LABELS, label } from "@/lib/format";
import { recommendResume } from "@/lib/resumeMatch";
import { interviewPrep } from "@/lib/interviewPrep";
import { CopyButton } from "@/components/CopyButton";

type Explanation = { reasons?: string[]; seasonEvidence?: string | null };
type Change = { field: string; summary: string; old?: unknown; new?: unknown };

export default async function JobDetail({ params }: { params: { id: string } }) {
  const userId = await requireUserId();
  const job = await prisma.job.findUnique({
    where: { id: params.id },
    include: { company: true, sources: { orderBy: { isPrimary: "desc" } }, versions: { orderBy: { version: "desc" }, take: 10 } },
  });
  if (!job) notFound();
  const [app, resumes, contacts, similar, savedAnswers] = await Promise.all([
    prisma.application.findUnique({ where: { userId_jobId: { userId, jobId: job.id } } }),
    prisma.resume.findMany({ where: { userId }, select: { id: true, label: true, isDefault: true, extractedText: true } }),
    prisma.contact.findMany({ where: { userId, companyId: job.companyId } }),
    prisma.job.findMany({ where: { id: { not: job.id }, status: "OPEN", isExcluded: false, OR: [{ companyId: job.companyId }, { roleCategory: job.roleCategory, experienceLevel: job.experienceLevel }] },
      include: { company: { select: { name: true } } }, orderBy: { fitScore: { sort: "desc", nulls: "last" } }, take: 5 }),
    prisma.savedAnswer.findMany({ where: { userId }, select: { id: true, question: true, answer: true }, orderBy: { updatedAt: "desc" }, take: 20 }),
  ]);
  const rec = recommendResume(job.technologies, resumes.map((r) => ({ id: r.id, label: r.label, isDefault: r.isDefault, text: r.extractedText ?? "" })));
  const ex = (job.fitExplanation ?? {}) as Explanation;
  const concerns = (job.concerns ?? []) as string[];
  const seasonStated = job.seasonProvenance === "ATS";
  const comp = job.compensationRaw ?? (job.compensationMin ? `$${job.compensationMin.toLocaleString()}–$${job.compensationMax?.toLocaleString()}` : null);
  const prep = app ? interviewPrep({ status: app.status, role: job.roleCategory, technologies: job.technologies }) : [];
  const Sec = ({ t, children }: { t: string; children: React.ReactNode }) => <section className="card space-y-2 p-4"><h2 className="h2">{t}</h2>{children}</section>;

  return (
    <div className="page">
      <div className="card space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={`/companies/${job.companyId}`} className="text-sm muted hover:underline">{job.company.name}</Link>
            <h1 className="h1">{job.title}</h1>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="badge">{ROLE_LABELS[job.roleCategory]}</span><span className="badge">{EXP_LABELS[job.experienceLevel]}</span>
              {job.location && <span className="badge">{job.location}</span>}{job.workMode !== "UNKNOWN" && <span className="badge">{label(job.workMode)}</span>}
              {comp && <span className="badge badge-success">{comp}</span>}
              {job.targetYear && <span className="badge">{seasonStated ? "" : "Likely "}{job.targetSeason ?? ""} {job.targetYear}</span>}
              <StatusBadge status={job.status} />
              {contacts.length > 0 && <span className="badge badge-primary">Referral available at this company</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <FitBadge score={job.fitScore} />
            <a href={job.applicationUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary px-4 py-2 text-sm">Apply on official site <ExternalLink className="h-3.5 w-3.5" /></a>
          </div>
        </div>
        <div className="text-xs muted">
          {discoveryKind(job.datePosted, job.firstDiscoveredAt, job.isReposted, job.reopenedAt)} {relTime(job.firstDiscoveredAt)} · {job.datePosted ? `Posted ${relTime(job.datePosted)}` : "Posting date not published by employer"}
          {job.version > 1 && ` · Updated ${relTime(job.lastUpdatedAt)}`} · Last seen {relTime(job.lastObservedAt)}
          {job.applicationDeadline && ` · Deadline ${job.applicationDeadline.toLocaleDateString()}`}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Sec t="Why you match">
          {ex.reasons?.length ? <ul className="space-y-1 text-sm">{ex.reasons.map((r) => <li key={r}>✓ {r}</li>)}</ul> : <p className="text-sm muted">No scoring explanation yet — set up your profile and run <code>npm run worker:rescore</code>.</p>}
          {!seasonStated && job.targetYear && <p className="text-xs muted">Season is inferred{ex.seasonEvidence ? ` from “${ex.seasonEvidence}”` : ""}; the employer did not state it explicitly.</p>}
        </Sec>
        <Sec t="Potential concerns">
          {concerns.length ? <ul className="space-y-1 text-sm">{concerns.map((c) => <li key={c} style={{ color: "hsl(var(--warning))" }}>⚠ {c}</li>)}</ul> : <p className="text-sm muted">None detected.</p>}
          {job.isExcluded && <p className="text-xs" style={{ color: "hsl(var(--danger))" }}>Hidden by your exclusion rules: {job.exclusionReasons.join("; ")}</p>}
          {job.citizenshipRequirement && <p className="text-xs muted">Employer states: “{job.citizenshipRequirement}”</p>}
          {job.sponsorshipInfo && <p className="text-xs muted">Employer states: “{job.sponsorshipInfo}”</p>}
        </Sec>
      </div>

      <ApplicationPanel jobId={job.id} resumes={resumes.map((r) => ({ id: r.id, label: r.label }))} app={app ? JSON.parse(JSON.stringify(app)) : null} />
      <DraftPanel jobId={job.id} resumes={resumes.map((r) => ({ id: r.id, label: r.label }))} />

      {prep.length > 0 && (
        <Sec t="Interview prep">
          <p className="text-xs muted">General study topics for your current stage and this role. Not a description of how {job.company.name} interviews.</p>
          {prep.map((p) => <details key={p.title} className="text-sm"><summary className="cursor-pointer font-medium">{p.title}</summary>
            <ul className="ml-4 mt-1 list-disc space-y-0.5 text-xs">{p.items.map((i) => <li key={i}>{i}</li>)}</ul></details>)}
        </Sec>)}
      <Sec t="Saved answers">
        {savedAnswers.length === 0 && <p className="text-sm muted">None yet. <Link className="underline" href="/resumes">Save answers to common questions</Link> and copy them here.</p>}
        {savedAnswers.map((a) => <div key={a.id} className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{a.question}</span><CopyButton text={a.answer} /></div>)}
      </Sec>

      <Sec t="Best resume for this job">
        {rec.best && <p className="text-sm"><span className="badge badge-primary mr-2">Recommended</span><b>{rec.best.label}</b></p>}
        <p className="text-sm">{rec.reason}</p>
        {rec.jobTechs.length > 0 && <p className="text-xs muted">Job mentions: {rec.jobTechs.join(", ")}</p>}
        {rec.perResume.length > 1 && <div className="space-y-0.5 text-xs muted">{rec.perResume.map((r) => <div key={r.id}>{r.label}: {r.covered.length}/{rec.jobTechs.length}{r.missing.length ? ` · missing ${r.missing.join(", ")}` : ""}</div>)}</div>}
      </Sec>
      {job.qualifications && <Sec t="Requirements"><p className="whitespace-pre-line text-sm">{job.qualifications}</p></Sec>}
      {job.preferredQualifications && <Sec t="Preferred qualifications"><p className="whitespace-pre-line text-sm">{job.preferredQualifications}</p></Sec>}
      {job.technologies.length > 0 && <Sec t="Technologies mentioned"><div className="flex flex-wrap gap-1.5">{job.technologies.map((t) => <span key={t} className="badge badge-primary">{t}</span>)}</div></Sec>}
      <Sec t="Full description"><p className="whitespace-pre-line text-sm leading-relaxed">{job.description}</p></Sec>

      <Sec t="Company contacts">
        {contacts.map((c) => <div key={c.id} className="text-sm">{c.name}{c.position ? ` — ${c.position}` : ""} {c.referralReceived ? <span className="badge badge-success">referral received</span> : c.referralRequested ? <span className="badge badge-warning">referral requested</span> : null}
          {c.linkedinUrl && <> · <a className="underline" href={c.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn</a></>}</div>)}
        <Link className="text-xs underline muted" href={`/contacts?companyId=${job.companyId}`}>{contacts.length ? "Manage contacts" : "Add a contact at this company"}</Link></Sec>

      <div className="grid gap-5 md:grid-cols-2">
        <Sec t="Similar roles">
          {similar.map((s) => <div key={s.id} className="text-sm"><Link className="hover:underline" href={`/jobs/${s.id}`}>{s.company.name} — {s.title}</Link></div>)}
          {similar.length === 0 && <p className="text-sm muted">None.</p>}
        </Sec>
        <Sec t="Posting history">
          {job.versions.map((v) => {
            const changes = (v.diff ?? []) as Change[];
            return <div key={v.id} className="text-sm"><b>v{v.version}</b> <span className="muted">{relTime(v.capturedAt)}</span>
              {v.version === 1 ? <span className="muted"> · first seen</span> : changes.map((c) => <div key={c.field} className="ml-3 text-xs">• {c.summary}{c.old != null && c.new != null && typeof c.old !== "object" ? `: ${String(c.old).slice(0, 60)} → ${String(c.new).slice(0, 60)}` : ""}</div>)}</div>;
          })}
        </Sec>
      </div>

      <Sec t="Sources & provenance">
        <ul className="space-y-1 text-xs">
          {job.sources.map((s) => <li key={s.id}><span className="badge mr-1">{s.isPrimary ? "primary" : "also seen"}</span>{s.source} · <a className="underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a></li>)}
          <li className="muted">Role/level: {job.classificationProvenance === "ATS" ? "derived from the posting’s own title/text" : "AI-inferred"} · Season: {job.targetYear ? (seasonStated ? "stated in posting" : "AI-inferred") : "not found"}</li>
        </ul>
      </Sec>
    </div>
  );
}
