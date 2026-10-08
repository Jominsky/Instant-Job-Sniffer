"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RuleBuilder } from "@/components/RuleBuilder";
import { hasCriteria, type Rule } from "@/lib/rules";

const CHANNELS = ["BROWSER", "EMAIL", "DISCORD", "SLACK", "SMS", "PUSH"];
export type AlertRow = { id: string; name: string; desc: string; channels: string[]; frequency: string; isActive: boolean; watchlist: string | null; sent: number };

export function AlertsManager({ alerts, companies, watchlists }: { alerts: AlertRow[]; companies: { id: string; name: string }[]; watchlists: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [rule, setRule] = useState<Rule>({ minFit: 85, experienceLevels: ["INTERNSHIP"] });
  const [channels, setChannels] = useState<string[]>(["BROWSER"]); const [frequency, setFrequency] = useState("IMMEDIATE"); const [watchlistId, setWatchlistId] = useState("");
  const [msg, setMsg] = useState("");
  async function create() {
    const r = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, ruleJson: rule, channels, frequency, watchlistId: watchlistId || null }) });
    if (r.ok) { setOpen(false); setName(""); setMsg(""); router.refresh(); } else setMsg((await r.json().catch(() => ({}))).error ?? "Check the form");
  }
  const patch = async (id: string, b: object) => { await fetch(`/api/alerts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); router.refresh(); };
  return (
    <div className="space-y-4">
      {!open ? <button className="btn btn-primary" onClick={() => setOpen(true)}>New alert</button> : (
        <div className="card space-y-3 p-4"><h2 className="h2">New alert</h2>
          <input className="input" placeholder='Name, e.g. "Critical: strong Summer 2027 internships"' value={name} onChange={(e) => setName(e.target.value)} />
          <RuleBuilder value={rule} onChange={setRule} companies={companies} />
          <label className="block text-xs">Also require a watchlist (alert fires only for jobs matching both)
            <select className="input mt-1" value={watchlistId} onChange={(e) => setWatchlistId(e.target.value)}><option value="">None</option>{watchlists.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap gap-x-3">{CHANNELS.map((c) => <label key={c} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={channels.includes(c)} onChange={(e) => setChannels(e.target.checked ? [...channels, c] : channels.filter((x) => x !== c))} />{c.toLowerCase()}</label>)}</div>
            <select className="input w-auto" value={frequency} onChange={(e) => setFrequency(e.target.value)}><option value="IMMEDIATE">Immediately</option><option value="HOURLY">Hourly digest</option><option value="MORNING">Morning digest</option><option value="EVENING">Evening digest</option></select></div>
          <p className="text-xs muted">Email/Discord/Slack/SMS credentials are set in the worker’s environment (.env). Push is not implemented yet; browser notifications work while JobIntel is open in a tab.</p>
          <div className="flex items-center gap-2"><button className="btn btn-primary" disabled={!name.trim() || channels.length === 0 || (!hasCriteria(rule) && !watchlistId)} onClick={create}>Create alert</button><button className="btn" onClick={() => setOpen(false)}>Cancel</button><span className="text-xs" style={{ color: "hsl(var(--danger))" }}>{msg}</span></div></div>)}
      <div className="space-y-3">{alerts.map((a) => (
        <div key={a.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0"><div className="flex items-center gap-2 font-medium">{a.name}<span className="badge">{a.frequency.toLowerCase()}</span><span className="badge">{a.channels.join(" · ").toLowerCase()}</span>{a.watchlist && <span className="badge badge-primary">list: {a.watchlist}</span>}</div>
            <div className="text-xs muted">{a.desc} · {a.sent} sent</div></div>
          <div className="flex gap-2"><button className={`badge ${a.isActive ? "badge-success" : "badge-warning"}`} onClick={() => patch(a.id, { isActive: !a.isActive })}>{a.isActive ? "On" : "Paused"}</button>
            <button className="btn" onClick={async () => { if (confirm("Delete this alert?")) { await fetch(`/api/alerts/${a.id}`, { method: "DELETE" }); router.refresh(); } }}>Delete</button></div></div>))}
        {alerts.length === 0 && !open && <div className="card p-6 text-center text-sm muted">No alerts yet. A good first one: fit ≥ 85, internship, your target season, in any quant firm.</div>}</div>
    </div>
  );
}
