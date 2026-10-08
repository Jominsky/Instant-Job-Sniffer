"use client";
import { useState } from "react";

const KINDS: [string, string][] = [["why_company", "Why this company?"], ["why_role", "Why this role?"], ["cover_letter", "Cover letter"], ["short_answer", "Short application question"]];

export function DraftPanel({ jobId, resumes }: { jobId: string; resumes: { id: string; label: string }[] }) {
  const [kind, setKind] = useState("why_role"); const [question, setQuestion] = useState(""); const [notes, setNotes] = useState("");
  const [resumeId, setResumeId] = useState(""); const [draft, setDraft] = useState(""); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  async function go() {
    setBusy(true); setMsg("");
    const r = await fetch(`/api/jobs/${jobId}/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, question: question || undefined, notes: notes || undefined, resumeId: resumeId || undefined }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { setDraft(d.draft); setMsg(`Draft by ${d.provider}${d.usedResume ? ` using “${d.usedResume}”` : " (no resume on file: expect [ADD: …] placeholders)"}. Review every line before using it.`); }
    else setMsg(d.error ?? "Could not generate a draft");
  }
  return (
    <section className="card space-y-3 p-4"><h2 className="h2">Draft assistant</h2>
      <p className="text-xs muted">Generates an editable draft from your resume and this posting. It only uses facts from your resume, leaves [ADD: …] placeholders where it lacks them, and never submits anything.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select className="input" value={resumeId} onChange={(e) => setResumeId(e.target.value)}><option value="">Default resume</option>{resumes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
      {kind === "short_answer" && <textarea className="input min-h-16" placeholder="Paste the application question" value={question} onChange={(e) => setQuestion(e.target.value)} />}
      <textarea className="input min-h-16" placeholder="Optional: facts to include (e.g. why you like this firm, a relevant project not on your resume)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex items-center gap-2"><button className="btn btn-primary" disabled={busy || (kind === "short_answer" && !question.trim())} onClick={go}>{busy ? "Drafting…" : "Generate draft"}</button><span className="text-xs muted">{msg}</span></div>
      {draft && <><textarea className="input min-h-48" value={draft} onChange={(e) => setDraft(e.target.value)} /><button className="btn" onClick={() => navigator.clipboard.writeText(draft)}>Copy</button></>}
    </section>
  );
}
