"use client";
import { RULE_OPTIONS, type Rule } from "@/lib/rules";
import { label } from "@/lib/format";

const csv = (v?: (string | number)[]) => (v ?? []).join(", ");
const parse = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function Checks<T extends string>({ title, options, value = [], onChange }: { title: string; options: readonly T[]; value?: T[]; onChange: (v: T[]) => void }) {
  return (
    <fieldset className="space-y-1"><legend className="text-xs font-medium">{title}</legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">{options.map((o) => (
        <label key={o} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={value.includes(o)} onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((x) => x !== o))} />{label(o)}</label>))}</div>
    </fieldset>
  );
}

/** Shared by alerts and watchlists. Emits a Rule (see lib/rules.ts); empty fields are omitted. */
export function RuleBuilder({ value, onChange, companies }: { value: Rule; onChange: (r: Rule) => void; companies: { id: string; name: string }[] }) {
  const set = <K extends keyof Rule>(k: K, v: Rule[K] | undefined | []) => {
    const next = { ...value } as Record<string, unknown>;
    if (v === undefined || (Array.isArray(v) && v.length === 0) || v === false) delete next[k as string]; else next[k as string] = v;
    onChange(next as Rule);
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">Minimum fit score<input type="number" min={0} max={100} className="input mt-1" value={value.minFit ?? ""} onChange={(e) => set("minFit", e.target.value === "" ? undefined : Number(e.target.value))} placeholder="e.g. 85" /></label>
        <label className="text-xs">Years (comma-separated)<input className="input mt-1" value={csv(value.years)} onChange={(e) => set("years", parse(e.target.value).map(Number).filter((n) => n >= 2020 && n <= 2040))} placeholder="2027" /></label>
        <label className="flex items-end gap-2 pb-1.5 text-xs"><input type="checkbox" checked={!!value.statedSeasonOnly} onChange={(e) => set("statedSeasonOnly", e.target.checked)} />Only when employer states the season</label>
      </div>
      <Checks title="Level" options={RULE_OPTIONS.EXP} value={value.experienceLevels} onChange={(v) => set("experienceLevels", v)} />
      <Checks title="Role" options={RULE_OPTIONS.ROLES} value={value.roleCategories} onChange={(v) => set("roleCategories", v)} />
      <Checks title="Season" options={["Summer", "Fall", "Winter", "Spring"] as const} value={value.seasons} onChange={(v) => set("seasons", v)} />
      <Checks title="Company group (any company in the group)" options={RULE_OPTIONS.CATS} value={value.categories} onChange={(v) => set("categories", v)} />
      <Checks title="Company priority" options={["P0", "P1", "P2", "P3"] as const} value={value.priorities} onChange={(v) => set("priorities", v)} />
      <label className="block text-xs">Specific companies (hold Ctrl/Cmd to select several; combined with groups above using OR)
        <select multiple className="input mt-1 h-28" value={value.companyIds ?? []} onChange={(e) => set("companyIds", Array.from(e.target.selectedOptions).map((o) => o.value))}>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">Locations (or “remote”)<input className="input mt-1" value={csv(value.locations)} onChange={(e) => set("locations", parse(e.target.value))} placeholder="New York, Chicago" /></label>
        <label className="text-xs">Technologies<input className="input mt-1" value={csv(value.technologies)} onChange={(e) => set("technologies", parse(e.target.value))} placeholder="C++, Python" /></label>
        <label className="text-xs">Keywords (title/description)<input className="input mt-1" value={csv(value.keywords)} onChange={(e) => set("keywords", parse(e.target.value))} placeholder="low latency" /></label>
      </div>
    </div>
  );
}
