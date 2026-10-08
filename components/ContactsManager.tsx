"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { relTime } from "@/lib/format";

export type ContactRow = { id: string; name: string; position: string | null; linkedinUrl: string | null; email: string | null; phone: string | null; companyId: string | null;
  companyName: string | null; alumniConnection: boolean; schoolConnection: boolean; fraternityConnection: boolean; referralRequested: boolean; referralReceived: boolean;
  lastContactedAt: string | null; notes: string | null };
const blank = { name: "", companyId: "", position: "", linkedinUrl: "", email: "", phone: "", alumniConnection: false, schoolConnection: false, fraternityConnection: false, notes: "" };

export function ContactsManager({ contacts, companies, prefillCompanyId }: { contacts: ContactRow[]; companies: { id: string; name: string }[]; prefillCompanyId?: string }) {
  const router = useRouter();
  const [f, setF] = useState({ ...blank, companyId: prefillCompanyId ?? "" }); const [msg, setMsg] = useState("");
  const patch = async (id: string, b: object) => { await fetch(`/api/contacts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); router.refresh(); };
  async function add() {
    const r = await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, companyId: f.companyId || null }) });
    if (r.ok) { setF({ ...blank, companyId: f.companyId }); setMsg("Added"); router.refresh(); } else setMsg("Check the fields (valid LinkedIn URL / email).");
  }
  const chk = (k: "alumniConnection" | "schoolConnection" | "fraternityConnection", l: string) => <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />{l}</label>;
  return (
    <div className="space-y-5">
      <div className="card space-y-2 p-4"><h2 className="h2">Add a contact</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <select className="input" value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })}><option value="">Company…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input className="input" placeholder="Position" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} />
          <input className="input" placeholder="LinkedIn URL" value={f.linkedinUrl} onChange={(e) => setF({ ...f, linkedinUrl: e.target.value })} />
          <input className="input" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <input className="input" placeholder="Phone (manual entry)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div className="flex flex-wrap gap-4">{chk("alumniConnection", "Alumni")}{chk("schoolConnection", "School connection")}{chk("fraternityConnection", "Fraternity")}</div>
        <textarea className="input min-h-16" placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <div className="flex items-center gap-2"><button className="btn btn-primary" disabled={!f.name.trim()} onClick={add}>Add contact</button><span className="text-xs muted">{msg}</span></div>
        <p className="text-xs muted">JobIntel never contacts anyone for you. Contact details are private to your account.</p></div>
      <div className="space-y-3">{contacts.map((c) => (
        <div key={c.id} className="card space-y-2 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><div className="font-medium">{c.name}{c.position && <span className="muted"> · {c.position}</span>}</div>
              <div className="text-xs muted">{c.companyName ?? "No company"}{c.linkedinUrl && <> · <a className="underline" href={c.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn</a></>}{c.email && ` · ${c.email}`}{c.phone && ` · ${c.phone}`}</div>
              <div className="mt-1 flex gap-1">{c.alumniConnection && <span className="badge">alumni</span>}{c.schoolConnection && <span className="badge">school</span>}{c.fraternityConnection && <span className="badge">fraternity</span>}</div></div>
            <button className="btn" onClick={() => confirm(`Delete ${c.name}?`) && fetch(`/api/contacts/${c.id}`, { method: "DELETE" }).then(() => router.refresh())}>Delete</button></div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center gap-1"><input type="checkbox" checked={c.referralRequested} onChange={(e) => patch(c.id, { referralRequested: e.target.checked })} />Referral requested</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={c.referralReceived} onChange={(e) => patch(c.id, { referralReceived: e.target.checked })} />Referral received</label>
            <span className="muted">Last contacted: {c.lastContactedAt ? relTime(c.lastContactedAt) : "never"}</span>
            <button className="btn" onClick={() => patch(c.id, { lastContactedAt: new Date().toISOString() })}>Mark contacted today</button></div>
          {c.notes && <p className="whitespace-pre-line text-xs muted">{c.notes}</p>}</div>))}
        {contacts.length === 0 && <div className="card p-6 text-center text-sm muted">No contacts yet. Add people at your target companies — jobs there will show “Referral available”.</div>}</div>
    </div>
  );
}
