"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RuleBuilder } from "@/components/RuleBuilder";
import { hasCriteria, type Rule } from "@/lib/rules";

type Co = { id: string; name: string }[];

export function NewWatchlist({ companies }: { companies: Co }) {
  const router = useRouter();
  const [name, setName] = useState(""); const [rule, setRule] = useState<Rule>({}); const [msg, setMsg] = useState(""); const [open, setOpen] = useState(false);
  async function create() {
    const r = await fetch("/api/watchlists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, filterJson: rule }) });
    if (r.ok) { const w = await r.json(); router.push(`/watchlists/${w.id}`); } else setMsg("Check the name and criteria.");
  }
  if (!open) return <button className="btn btn-primary" onClick={() => setOpen(true)}>New watchlist</button>;
  return (
    <div className="card space-y-3 p-4"><h2 className="h2">New watchlist</h2>
      <input className="input" placeholder='Name, e.g. "Dream Companies", "Quant", "NYC"' value={name} onChange={(e) => setName(e.target.value)} />
      <RuleBuilder value={rule} onChange={setRule} companies={companies} />
      <div className="flex items-center gap-2"><button className="btn btn-primary" disabled={!name.trim() || !hasCriteria(rule)} onClick={create}>Create</button><button className="btn" onClick={() => setOpen(false)}>Cancel</button><span className="text-xs muted">{msg}</span></div></div>
  );
}

export function EditWatchlist({ id, name: n0, rule: r0, companies }: { id: string; name: string; rule: Rule; companies: Co }) {
  const router = useRouter();
  const [open, setOpen] = useState(false); const [name, setName] = useState(n0); const [rule, setRule] = useState<Rule>(r0);
  const [msg, setMsg] = useState("");
  const [channel, setChannel] = useState("BROWSER"); const [freq, setFreq] = useState("IMMEDIATE");
  async function save() {
    const r = await fetch(`/api/watchlists/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, filterJson: rule }) });
    setMsg(r.ok ? "Saved" : "Error"); if (r.ok) { setOpen(false); router.refresh(); }
  }
  async function makeAlert() {
    const r = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `${n0} alert`, ruleJson: {}, channels: [channel], frequency: freq, watchlistId: id }) });
    setMsg(r.ok ? "Alert created — see the Alerts page" : "Could not create alert");
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" onClick={() => setOpen(!open)}>{open ? "Close editor" : "Edit watchlist"}</button>
        <button className="btn" onClick={async () => { if (confirm("Delete this watchlist? Alerts tied to it will stop matching.")) { await fetch(`/api/watchlists/${id}`, { method: "DELETE" }); router.push("/watchlists"); } }}>Delete</button>
        <span className="mx-2 text-xs muted">Notify me:</span>
        <select className="input w-auto py-1 text-xs" value={channel} onChange={(e) => setChannel(e.target.value)}>{["BROWSER", "EMAIL", "DISCORD", "SLACK", "SMS"].map((c) => <option key={c}>{c}</option>)}</select>
        <select className="input w-auto py-1 text-xs" value={freq} onChange={(e) => setFreq(e.target.value)}>{["IMMEDIATE", "HOURLY", "MORNING", "EVENING"].map((c) => <option key={c}>{c}</option>)}</select>
        <button className="btn" onClick={makeAlert}>Create alert for this list</button><span className="text-xs muted">{msg}</span>
      </div>
      {open && <div className="card space-y-3 p-4"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /><RuleBuilder value={rule} onChange={setRule} companies={companies} />
        <button className="btn btn-primary" disabled={!name.trim() || !hasCriteria(rule)} onClick={save}>Save changes</button></div>}
    </div>
  );
}
