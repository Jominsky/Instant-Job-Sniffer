"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "./CopyButton";

export type AnswerRow = { id: string; question: string; answer: string; tags: string[] };

/** Saved answers to common application questions. Stored privately; copied by hand into applications, never auto-submitted. */
export function AnswersManager({ answers }: { answers: AnswerRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState(""); const [a, setA] = useState(""); const [tags, setTags] = useState(""); const [msg, setMsg] = useState(""); const [filter, setFilter] = useState("");
  const parseTags = (t: string) => t.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10);
  function reset() { setEditing(null); setQ(""); setA(""); setTags(""); setMsg(""); }
  async function save() {
    const body = JSON.stringify({ question: q, answer: a, tags: parseTags(tags) });
    const r = await fetch(editing ? `/api/answers/${editing}` : "/api/answers", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body });
    if (r.ok) { reset(); router.refresh(); } else setMsg((await r.json().catch(() => ({}))).error ?? "Could not save.");
  }
  async function remove(id: string) { if (!confirm("Delete this saved answer?")) return; await fetch(`/api/answers/${id}`, { method: "DELETE" }); router.refresh(); }
  const shown = answers.filter((x) => !filter || `${x.question} ${x.answer} ${x.tags.join(" ")}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <section className="space-y-3">
      <div className="card space-y-2 p-4">
        <h2 className="h2">{editing ? "Edit answer" : "Add a saved answer"}</h2>
        <input className="input w-full" placeholder="Question, e.g. Why do you want to work here?" maxLength={200} value={q} onChange={(e) => setQ(e.target.value)} />
        <textarea className="input w-full" rows={4} placeholder="Your answer. Edit it per company before pasting." maxLength={5000} value={a} onChange={(e) => setA(e.target.value)} />
        <input className="input w-full" placeholder="Tags, comma separated (work-auth, behavioral, motivation)" value={tags} onChange={(e) => setTags(e.target.value)} />
        <div className="flex items-center gap-2">
          <button className="btn btn-primary" disabled={!q.trim() || !a.trim()} onClick={save}>{editing ? "Save changes" : "Add answer"}</button>
          {editing && <button className="btn" onClick={reset}>Cancel</button>}
          {msg && <span className="text-xs" style={{ color: "hsl(var(--danger))" }}>{msg}</span>}
        </div>
      </div>
      {answers.length > 3 && <input className="input w-full" placeholder="Search saved answers" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      {answers.length === 0 && <p className="text-sm muted">Nothing saved yet. Keep your answers to the questions every application asks in one place.</p>}
      {shown.map((x) => (
        <div key={x.id} className="card space-y-2 p-4">
          <div className="flex items-start justify-between gap-3"><div className="font-medium">{x.question}</div>
            <div className="flex shrink-0 gap-2"><CopyButton text={x.answer} />
              <button className="btn" onClick={() => { setEditing(x.id); setQ(x.question); setA(x.answer); setTags(x.tags.join(", ")); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
              <button className="btn" onClick={() => remove(x.id)}>Delete</button></div></div>
          <p className="whitespace-pre-wrap text-sm muted">{x.answer}</p>
          {x.tags.length > 0 && <div className="flex flex-wrap gap-1">{x.tags.map((t) => <span key={t} className="badge">{t}</span>)}</div>}
        </div>))}
    </section>
  );
}
