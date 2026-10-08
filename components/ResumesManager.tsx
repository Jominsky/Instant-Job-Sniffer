"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type ResumeRow = { id: string; label: string; skills: string[]; isDefault: boolean; createdAt: string };

export function ResumesManager({ resumes }: { resumes: ResumeRow[] }) {
  const router = useRouter();
  const [label, setLabel] = useState(""); const [text, setText] = useState(""); const [msg, setMsg] = useState("");
  async function add() {
    const r = await fetch("/api/resumes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, text }) });
    if (r.ok) { setLabel(""); setText(""); setMsg("Added. Skills were extracted from the text."); router.refresh(); } else setMsg("Add a label and paste the resume text (a few lines at least).");
  }
  const call = async (url: string, method: string) => { await fetch(url, { method }); router.refresh(); };
  return (
    <div className="space-y-5">
      <div className="card space-y-2 p-4"><h2 className="h2">Add a resume version</h2>
        <input className="input" placeholder='Label, e.g. "Quant SWE", "General SWE", "AI/ML"' value={label} onChange={(e) => setLabel(e.target.value)} />
        <textarea className="input min-h-40 font-mono text-xs" placeholder="Paste the resume text here (or load a .txt / .md file). PDF files: copy the text out of the PDF." value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap items-center gap-3"><input type="file" accept=".txt,.md,text/plain,text/markdown" className="text-xs" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); if (!label) setLabel(f.name.replace(/\.\w+$/, "")); } }} />
          <button className="btn btn-primary" onClick={add} disabled={!label.trim() || text.trim().length < 20}>Add resume</button><span className="text-xs muted">{msg}</span></div>
        <p className="text-xs muted">Text is stored in your database only. It is used for similarity scoring and for recommending which version to send; nothing is edited or fabricated.</p></div>
      <div className="space-y-3">{resumes.map((r) => (
        <div key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div><div className="flex items-center gap-2 font-medium">{r.label}{r.isDefault && <span className="badge badge-primary">default</span>}</div>
            <div className="mt-1 flex flex-wrap gap-1">{r.skills.map((s) => <span key={s} className="badge">{s}</span>)}{r.skills.length === 0 && <span className="text-xs muted">No known technologies detected</span>}</div></div>
          <div className="flex gap-2">{!r.isDefault && <button className="btn" onClick={() => call(`/api/resumes/${r.id}`, "PATCH")}>Make default</button>}
            <button className="btn" onClick={() => confirm(`Delete “${r.label}”?`) && call(`/api/resumes/${r.id}`, "DELETE")}>Delete</button></div></div>))}
        {resumes.length === 0 && <div className="card p-6 text-center text-sm muted">No resumes yet. The default one feeds the resume-similarity part of your fit score.</div>}</div>
    </div>
  );
}
