"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type SavedSearchRow = { id: string; name: string; href: string };

/** Lists saved searches (each is just a link to /jobs with its filters) and saves the current one. */
export function SavedSearches({ saved, current, active }: { saved: SavedSearchRow[]; current: Record<string, string>; active: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(""); const [open, setOpen] = useState(false); const [msg, setMsg] = useState("");
  async function save() {
    const { page: _p, ...filters } = current;
    const r = await fetch("/api/saved-searches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, query: current.q, filters }) });
    if (r.ok) { setName(""); setOpen(false); setMsg(""); router.refresh(); } else setMsg((await r.json().catch(() => ({}))).error ?? "Could not save.");
  }
  async function remove(id: string) { await fetch(`/api/saved-searches/${id}`, { method: "DELETE" }); router.refresh(); }
  if (!saved.length && !active) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {saved.length > 0 && <span className="text-xs muted">Saved searches:</span>}
      {saved.map((s) => (
        <span key={s.id} className="badge badge-primary inline-flex items-center gap-1">
          <Link href={s.href}>{s.name}</Link>
          <button aria-label={`Delete saved search ${s.name}`} className="opacity-60 hover:opacity-100" onClick={() => remove(s.id)}>×</button>
        </span>
      ))}
      {active && !open && <button className="btn" onClick={() => setOpen(true)}>Save this search</button>}
      {active && open && (
        <span className="inline-flex items-center gap-2">
          <input className="input w-48" placeholder="Name this search" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary" disabled={!name.trim()} onClick={save}>Save</button>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
        </span>
      )}
      {msg && <span className="text-xs" style={{ color: "hsl(var(--danger))" }}>{msg}</span>}
    </div>
  );
}
