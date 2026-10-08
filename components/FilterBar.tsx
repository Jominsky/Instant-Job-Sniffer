import { SCANNABLE_ATS } from "@/lib/ats";
import { ROLE_LABELS, EXP_LABELS, CATEGORY_LABELS } from "@/lib/format";
import type { Filters } from "@/lib/jobs";

const SORTS = [["newest_discovered", "Newest discovered"], ["newest_posted", "Newest posted"], ["best_match", "Best match"],
  ["company_priority", "Company priority"], ["deadline", "Application deadline"], ["compensation", "Compensation"]];

/** Plain GET form, so every filter state is a shareable URL and works without client JS. */
export function FilterBar({ f, companies, action = "/jobs" }: { f: Filters; companies: { id: string; name: string }[]; action?: string }) {
  const sel = (name: string, opts: [string, string][], value?: string, any = "Any") => (
    <select name={name} defaultValue={value ?? ""} className="input w-auto">
      <option value="">{any}</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  return (
    <form action={action} className="card flex flex-wrap items-center gap-2 p-3">
      <input name="q" defaultValue={f.q} placeholder="Search…" className="input w-48" />
      {sel("role", Object.entries(ROLE_LABELS), f.role, "Role")}
      {sel("exp", Object.entries(EXP_LABELS), f.exp, "Level")}
      {sel("companyId", companies.map((c) => [c.id, c.name]), f.companyId, "Company")}
      {sel("category", Object.entries(CATEGORY_LABELS), f.category, "Group")}
      <input name="industry" defaultValue={f.industry} placeholder="Industry" className="input w-28" />
      <input name="location" defaultValue={f.location} placeholder="Location" className="input w-32" />
      <input name="tech" defaultValue={f.tech} placeholder="Tech (C++,Python)" className="input w-40" />
      {sel("season", ["Summer", "Fall", "Winter", "Spring"].map((s) => [s, s]), f.season, "Season")}
      <input name="year" defaultValue={f.year} placeholder="Year" className="input w-20" />
      {sel("minFit", [["50", "50+"], ["65", "65+"], ["80", "80+"], ["90", "90+"]], f.minFit, "Fit")}
      {sel("discoveredWithin", [["60", "Last hour"], ["1440", "Last 24h"], ["10080", "Last 7d"]], f.discoveredWithin, "Discovered")}
      {sel("postedWithin", [["60", "Last hour"], ["1440", "Last 24h"], ["10080", "Last 7d"]], f.postedWithin, "Posted")}
      {sel("priority", [["HIGH", "High"], ["LOW", "Low"]], f.priority, "My priority")}
      {sel("applied", [["0", "Not applied"], ["1", "Applied"]], f.applied, "Applied?")}
      {sel("ats", [...SCANNABLE_ATS].map((s) => [s, s.replace("_", " ")]), f.ats, "ATS")}
      {sel("sort", SORTS as [string, string][], f.sort ?? "newest_discovered", "Sort")}
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="remote" value="1" defaultChecked={f.remote === "1"} /> Remote</label>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="saved" value="1" defaultChecked={f.saved === "1"} /> Saved</label>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="newOnly" value="1" defaultChecked={f.newOnly === "1"} /> New only</label>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="showExcluded" value="1" defaultChecked={f.showExcluded === "1"} /> Show excluded</label>
      <select name="status" defaultValue={f.status ?? "OPEN"} className="input w-auto">
        <option value="OPEN">Open</option><option value="ANY">Any (full history)</option><option value="POSSIBLY_CLOSED">Possibly closed</option><option value="CLOSED">Closed</option>
      </select>
      <button className="btn btn-primary">Apply filters</button>
      <a href={action} className="btn">Reset</a>
    </form>
  );
}
