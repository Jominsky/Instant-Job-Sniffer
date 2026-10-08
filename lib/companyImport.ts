import { detectAts, slugify } from "./ats";

export type ImportRow = {
  name: string; careersUrl?: string; website?: string; category?: string; priority?: string; industry?: string; tags?: string[];
};
const CATS = ["BIG_TECH", "QUANT", "HEDGE_FUND", "PROP_TRADING", "FINTECH", "FORTUNE_500", "STARTUP", "HEALTHCARE", "FINANCE", "OTHER"];

function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === "," && !q) { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Accepts pasted names (one per line / comma separated) or CSV with a header row
 *  (name, careers_url, website, category, priority, industry, tags). */
export function parseCompanyText(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const head = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[\s-]+/g, "_"));
  const hasHeader = head.includes("name") || head.includes("company");
  if (hasHeader) {
    const idx = (k: string[]) => head.findIndex((h) => k.includes(h));
    const [iN, iU, iW, iC, iP, iI, iT] = [idx(["name", "company"]), idx(["careers_url", "careers", "url"]), idx(["website"]),
      idx(["category"]), idx(["priority"]), idx(["industry"]), idx(["tags"])];
    return lines.slice(1).map((l) => {
      const c = splitCsvLine(l);
      return { name: c[iN] ?? "", careersUrl: iU >= 0 ? c[iU] : undefined, website: iW >= 0 ? c[iW] : undefined,
        category: iC >= 0 ? c[iC] : undefined, priority: iP >= 0 ? c[iP] : undefined, industry: iI >= 0 ? c[iI] : undefined,
        tags: iT >= 0 && c[iT] ? c[iT].split(/[;|]/).map((t) => t.trim()).filter(Boolean) : undefined };
    }).filter((r) => r.name);
  }
  // Plain list: each line may be "Name" or "Name, https://careers..." ; single line may be comma-separated names
  const items = lines.length === 1 && !/https?:\/\//.test(lines[0]) ? lines[0].split(",").map((s) => s.trim()) : lines;
  return items.filter(Boolean).map((l) => {
    const url = l.match(/https?:\/\/\S+/)?.[0];
    const name = l.replace(url ?? "", "").replace(/[,;|\t-]+\s*$/, "").replace(/^[,;|\t-]+\s*/, "").trim();
    return { name: name || (url ? new URL(url).hostname : ""), careersUrl: url };
  }).filter((r) => r.name);
}

export function toCompanyData(r: ImportRow) {
  const ats = detectAts(r.careersUrl);
  const cat = (r.category ?? "").toUpperCase().replace(/[\s-]+/g, "_");
  const pri = (r.priority ?? "").toUpperCase();
  return {
    name: r.name.slice(0, 120), slug: slugify(r.name), careersUrl: r.careersUrl || null, website: r.website || null,
    atsProvider: ats.ats as never, atsIdentifier: ats.identifier,
    category: (CATS.includes(cat) ? cat : "OTHER") as never,
    priority: (["P0", "P1", "P2", "P3"].includes(pri) ? pri : "P2") as never,
    industry: r.industry || null, tags: r.tags ?? [],
  };
}
