"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { APP_STATUSES, label } from "@/lib/format";

type App = { id: string; status: string; notes: string | null; recruiter: string | null; referral: boolean; followUpDate: string | null; oaDeadline: string | null; resumeId: string | null } | null;

export function ApplicationPanel({ jobId, app, resumes }: { jobId: string; app: App; resumes: { id: string; label: string }[] }) {
  const router = useRouter();
  const [id, setId] = useState(app?.id ?? null);
  const [status, setStatus] = useState(app?.status ?? "DISCOVERED");
  const [notes, setNotes] = useState(app?.notes ?? "");
  const [recruiter, setRecruiter] = useState(app?.recruiter ?? "");
  const [followUp, setFollowUp] = useState(app?.followUpDate?.slice(0, 10) ?? "");
  const [oa, setOa] = useState(app?.oaDeadline?.slice(0, 10) ?? "");
  const [referral, setReferral] = useState(app?.referral ?? false);
  const [resumeId, setResumeId] = useState(app?.resumeId ?? "");
  const [saved, setSaved] = useState("");

  async function ensure(): Promise<string> {
    if (id) return id;
    const r = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, status }) });
    const a = await r.json(); setId(a.id); return a.id;
  }
  async function save(patch: Record<string, unknown>) {
    const aid = await ensure();
    const r = await fetch(`/api/applications/${aid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    setSaved(r.ok ? "Saved" : "Error saving"); setTimeout(() => setSaved(""), 1500); router.refresh();
  }
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between"><h2 className="h2">Application tracking</h2><span className="text-xs muted">{saved}</span></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Status
          <select className="input mt-1" value={status} onChange={(e) => { setStatus(e.target.value); save({ status: e.target.value }); }}>
            {APP_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label>
        <label className="text-xs">Resume used
          <select className="input mt-1" value={resumeId} onChange={(e) => { setResumeId(e.target.value); save({ resumeId: e.target.value || null }); }}>
            <option value="">—</option>{resumes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
        <label className="text-xs">Recruiter<input className="input mt-1" value={recruiter} onChange={(e) => setRecruiter(e.target.value)} onBlur={() => save({ recruiter: recruiter || null })} /></label>
        <label className="flex items-end gap-2 pb-1.5 text-xs"><input type="checkbox" checked={referral} onChange={(e) => { setReferral(e.target.checked); save({ referral: e.target.checked }); }} /> Referral</label>
        <label className="text-xs">Follow-up date<input type="date" className="input mt-1" value={followUp} onChange={(e) => { setFollowUp(e.target.value); save({ followUpDate: e.target.value || null }); }} /></label>
        <label className="text-xs">OA deadline<input type="date" className="input mt-1" value={oa} onChange={(e) => { setOa(e.target.value); save({ oaDeadline: e.target.value || null }); }} /></label>
      </div>
      <label className="block text-xs">Notes / answers / checklist
        <textarea className="input mt-1 min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => save({ notes })} /></label>
    </div>
  );
}
