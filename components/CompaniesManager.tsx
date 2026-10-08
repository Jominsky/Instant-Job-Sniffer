"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS, relTime } from "@/lib/format";
import { SCANNABLE_ATS } from "@/lib/ats";

export type CompanyRow = {
  id: string; name: string; logoUrl: string | null; careersUrl: string | null; atsProvider: string; atsIdentifier: string | null;
  category: string; priority: string; isActive: boolean; lastCheckedAt: string | null; lastSuccessfulScanAt: string | null;
  consecutiveFailures: number; openMatchingJobsCount: number; totalJobsDiscovered: number; tags: string[]; notes: string | null;
};
const SCANNABLE: readonly string[] = SCANNABLE_ATS;

export function CompaniesManager({ companies, lists, activeList }: { companies: CompanyRow[]; lists: { id: string; name: string; count: number }[]; activeList?: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [text, setText] = useState("");
  const [form, setForm] = useState({ name: "", careersUrl: "", category: "OTHER", priority: "P2" });
  const [targetList, setTargetList] = useState(activeList ?? "");
  const [newList, setNewList] = useState("");

  async function call(url: string, method: string, body?: unknown) {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) setMsg(`Error: ${(await r.json().catch(() => ({}))).error ?? r.status}`);
    router.refresh(); return r;
  }
  async function importText() {
    const r = await call("/api/companies", "POST", { text, listId: targetList || undefined });
    if (r.ok) { const j = await r.json(); setMsg(`Imported: ${j.created} new, ${j.updated} existing, ${j.skipped} skipped`); setText(""); }
  }
  async function addOne() {
    if (!form.name.trim()) return;
    const r = await call("/api/companies", "POST", { ...form, careersUrl: form.careersUrl || undefined });
    if (r.ok) { setMsg(`Added ${form.name}`); setForm({ ...form, name: "", careersUrl: "" }); }
  }
  const patch = (id: string, b: object) => call(`/api/companies/${id}`, "PATCH", b);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2 p-4">
          <h2 className="h2">Add a company</h2>
          <input className="input" placeholder="Company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Careers URL (Greenhouse / Lever / Ashby links are auto-detected)" value={form.careersUrl} onChange={(e) => setForm({ ...form, careersUrl: e.target.value })} />
          <div className="flex gap-2">
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{["P0", "P1", "P2", "P3"].map((p) => <option key={p}>{p}</option>)}</select>
            <button className="btn btn-primary" onClick={addOne}>Add</button>
          </div>
        </div>
        <div className="card space-y-2 p-4">
          <h2 className="h2">Bulk import</h2>
          <textarea className="input min-h-24 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)}
            placeholder={"Paste names, one per line (optionally with a careers URL):\nStripe https://boards.greenhouse.io/stripe\nJane Street\n\n…or paste CSV with header: name,careers_url,category,priority,tags"} />
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" accept=".csv,text/csv,text/plain" className="text-xs" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
            <select className="input w-auto" value={targetList} onChange={(e) => setTargetList(e.target.value)}><option value="">Add to list…</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            <button className="btn btn-primary" onClick={importText} disabled={!text.trim()}>Import</button>
          </div>
        </div>
      </div>
      {msg && <div className="card p-2 text-sm">{msg}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <a href="/companies" className={`btn ${!activeList ? "btn-primary" : ""}`}>All</a>
        {lists.map((l) => <a key={l.id} href={`/companies?list=${l.id}`} className={`btn ${activeList === l.id ? "btn-primary" : ""}`}>{l.name} ({l.count})</a>)}
        <input className="input w-40" placeholder="New list…" value={newList} onChange={(e) => setNewList(e.target.value)} />
        <button className="btn" onClick={async () => { if (newList.trim()) { await call("/api/lists", "POST", { name: newList.trim() }); setNewList(""); } }}>Create list</button>
        {activeList && <button className="btn" onClick={async () => { if (confirm("Delete this list? (Companies are kept.)")) { await call(`/api/lists/${activeList}`, "DELETE"); router.push("/companies"); } }}>Delete list</button>}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs muted"><tr className="border-b" style={{ borderColor: "hsl(var(--border))" }}>
            {["Company", "Category", "Priority", "ATS", "Last checked", "Open / total", "Monitoring", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {companies.map((c) => {
              const scannable = SCANNABLE.includes(c.atsProvider) && (c.atsProvider === "GENERIC_CAREERS_PAGE" ? !!c.careersUrl : !!c.atsIdentifier);
              return (
                <tr key={c.id} className="border-b last:border-0" style={{ borderColor: "hsl(var(--border))" }}>
                  <td className="px-3 py-2"><a className="font-medium hover:underline" href={`/companies/${c.id}`}>{c.name}</a>
                    <div className="text-xs muted">{c.careersUrl ? <a className="underline" href={c.careersUrl} target="_blank" rel="noopener noreferrer">careers page</a> : "no careers URL"}
                      {c.tags.length > 0 && ` · ${c.tags.join(", ")}`}</div></td>
                  <td className="px-3 py-2"><select className="input w-auto py-1 text-xs" value={c.category} onChange={(e) => patch(c.id, { category: e.target.value })}>{Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                  <td className="px-3 py-2"><select className="input w-auto py-1 text-xs" value={c.priority} onChange={(e) => patch(c.id, { priority: e.target.value })}>{["P0", "P1", "P2", "P3"].map((p) => <option key={p}>{p}</option>)}</select></td>
                  <td className="px-3 py-2 text-xs">{c.atsProvider.replaceAll("_", " ")}{!scannable && <div><button className="badge badge-warning" onClick={() => { const u = prompt(`Careers URL for ${c.name} (Greenhouse / Lever / Ashby URLs enable scanning):`, c.careersUrl ?? ""); if (u) patch(c.id, { careersUrl: u }); }}>needs careers URL</button></div>}</td>
                  <td className="px-3 py-2 text-xs">{relTime(c.lastCheckedAt)}{c.consecutiveFailures > 0 && <div className="badge badge-danger">{c.consecutiveFailures} failed scans</div>}
                    <div className="muted">ok: {relTime(c.lastSuccessfulScanAt)}</div></td>
                  <td className="px-3 py-2 text-xs">{c.openMatchingJobsCount} / {c.totalJobsDiscovered}</td>
                  <td className="px-3 py-2"><button className={`badge ${c.isActive ? "badge-success" : "badge-warning"}`} onClick={() => patch(c.id, { isActive: !c.isActive })}>{c.isActive ? "Active" : "Paused"}</button></td>
                  <td className="px-3 py-2 text-right"><button className="btn" onClick={() => { if (confirm(`Delete ${c.name} and all of its stored jobs? Consider pausing instead; closed jobs are useful history.`)) call(`/api/companies/${c.id}`, "DELETE"); }}>Delete</button></td>
                </tr>
              );
            })}
            {companies.length === 0 && <tr><td colSpan={8} className="p-8 text-center muted">No companies yet. Add one or bulk-import above.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
