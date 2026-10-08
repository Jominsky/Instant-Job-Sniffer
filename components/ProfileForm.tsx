"use client";
import { useState } from "react";
import { ROLE_LABELS } from "@/lib/format";

export type ProfileData = {
  skills: string[]; languages: string[]; technologies: string[]; majors: string[]; preferredRoles: string[]; preferredLocations: string[];
  preferredCompanies: string[]; preferredIndustries: string[]; keywords: string[]; excludedKeywords: string[]; graduationYear: number | null;
  targetSeason: string; targetYear: number; sponsorshipRequired: boolean; minCompensation: number | null; exclusionRules: string[];
  weights: { role: number; experience: number; skills: number; company: number; location: number; resume: number };
};
const TITLE_RULES = ["senior", "staff", "principal", "lead", "manager", "director", "phd-only", "hardware-only"];
const W_LABELS: [keyof ProfileData["weights"], string][] = [["role", "Role relevance"], ["experience", "Experience eligibility"], ["skills", "Skills match"], ["company", "Company preference"], ["location", "Location preference"], ["resume", "Resume similarity"]];
const csv = (v: string[]) => v.join(", ");
const parse = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function ProfileForm({ initial }: { initial: ProfileData }) {
  const [p, setP] = useState(initial);
  const [msg, setMsg] = useState("");
  const years = Number((p.exclusionRules.find((r) => r.startsWith("years:")) ?? "years:0").split(":")[1]);
  const custom = p.exclusionRules.filter((r) => r.startsWith("kw:")).map((r) => r.slice(3));
  const sum = Object.values(p.weights).reduce((a, b) => a + b, 0);
  const setRules = (f: (rs: string[]) => string[]) => setP({ ...p, exclusionRules: f(p.exclusionRules) });
  const listField = (k: keyof ProfileData, title: string, ph = "") => (
    <label className="text-xs">{title}<input className="input mt-1" placeholder={ph} value={csv(p[k] as string[])} onChange={(e) => setP({ ...p, [k]: parse(e.target.value) })} /></label>);

  async function save() {
    setMsg("Saving…");
    const r = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    setMsg(r.ok ? "Saved. Fit scores refresh automatically while the worker scheduler is running (or run `npm run worker:rescore`)." : "Could not save: check the values.");
  }
  return (
    <div className="space-y-5">
      <section className="card space-y-3 p-4"><h2 className="h2">Targets</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-xs">Target season<select className="input mt-1" value={p.targetSeason} onChange={(e) => setP({ ...p, targetSeason: e.target.value })}>{["Summer", "Fall", "Winter", "Spring"].map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="text-xs">Target year<input type="number" className="input mt-1" value={p.targetYear} onChange={(e) => setP({ ...p, targetYear: Number(e.target.value) })} /></label>
          <label className="text-xs">Graduation year<input type="number" className="input mt-1" value={p.graduationYear ?? ""} onChange={(e) => setP({ ...p, graduationYear: e.target.value ? Number(e.target.value) : null })} /></label>
          <label className="text-xs">Minimum compensation (annual USD)<input type="number" className="input mt-1" value={p.minCompensation ?? ""} onChange={(e) => setP({ ...p, minCompensation: e.target.value ? Number(e.target.value) : null })} /></label>
        </div>
        <div><div className="mb-1 text-xs font-medium">Preferred roles</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">{Object.entries(ROLE_LABELS).filter(([k]) => k !== "OTHER").map(([k, l]) => (
            <label key={k} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={p.preferredRoles.includes(k)} onChange={(e) => setP({ ...p, preferredRoles: e.target.checked ? [...p.preferredRoles, k] : p.preferredRoles.filter((x) => x !== k) })} />{l}</label>))}</div></div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={p.sponsorshipRequired} onChange={(e) => setP({ ...p, sponsorshipRequired: e.target.checked })} />I need visa sponsorship (flags postings that say they can’t sponsor)</label>
      </section>

      <section className="card space-y-3 p-4"><h2 className="h2">Skills & preferences</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {listField("skills", "Skills (comma-separated)", "Python, C++, distributed systems")}{listField("technologies", "Technologies", "Linux, Kafka")}
          {listField("languages", "Languages", "Python, Java, C++")}{listField("majors", "Majors", "Computer Science")}
          {listField("preferredLocations", "Preferred locations", "New York, Chicago, Philadelphia")}
          {listField("preferredCompanies", "Preferred companies (exact names)", "Jane Street, Google")}
          {listField("preferredIndustries", "Industries", "Quant trading, Fintech")}{listField("keywords", "Boost keywords", "low latency, trading")}
          {listField("excludedKeywords", "Excluded keywords (lowers rank, shows a concern)", "defense")}
        </div>
        <p className="text-xs muted">Only list skills you actually have: matching rewards what you list, and nothing here is ever added to a resume.</p>
      </section>

      <section className="card space-y-3 p-4"><div className="flex items-center justify-between"><h2 className="h2">Fit score weights</h2><span className={`badge ${sum === 100 ? "badge-success" : "badge-warning"}`}>total {sum}{sum !== 100 && " (normalised automatically)"}</span></div>
        <div className="grid gap-3 sm:grid-cols-3">{W_LABELS.map(([k, l]) => (
          <label key={k} className="text-xs">{l}: <b>{p.weights[k]}</b><input type="range" min={0} max={60} className="w-full" value={p.weights[k]} onChange={(e) => setP({ ...p, weights: { ...p.weights, [k]: Number(e.target.value) } })} /></label>))}</div></section>

      <section className="card space-y-3 p-4"><h2 className="h2">Exclusion rules</h2>
        <p className="text-xs muted">Hide jobs you clearly don’t want. Seniority words only count in the <i>title</i> and never exclude internships, so “Software Engineering Intern — working with senior engineers” stays visible.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">{TITLE_RULES.map((r) => (
          <label key={r} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={p.exclusionRules.includes(r)} onChange={(e) => setRules((rs) => e.target.checked ? [...rs, r] : rs.filter((x) => x !== r))} />{r === "phd-only" ? "PhD-only" : r === "hardware-only" ? "Hardware-only" : `Title: ${r}`}</label>))}</div>
        <label className="flex items-center gap-2 text-xs">Exclude when it requires at least
          <select className="input w-auto" value={years} onChange={(e) => setRules((rs) => [...rs.filter((x) => !x.startsWith("years:")), ...(Number(e.target.value) ? [`years:${e.target.value}`] : [])])}>
            {[0, 2, 3, 4, 5, 7].map((y) => <option key={y} value={y}>{y === 0 ? "(off)" : `${y}+ years`}</option>)}</select> of experience</label>
        <label className="text-xs">Extra title keywords to exclude<input className="input mt-1" value={csv(custom)} placeholder="Recruiter, Sales"
          onChange={(e) => setRules((rs) => [...rs.filter((x) => !x.startsWith("kw:")), ...parse(e.target.value).slice(0, 15).map((k) => `kw:${k.slice(0, 40)}`)])} /></label>
      </section>
      <div className="flex items-center gap-3"><button className="btn btn-primary px-4 py-2 text-sm" onClick={save}>Save profile</button><span className="text-xs muted">{msg}</span></div>
    </div>
  );
}
