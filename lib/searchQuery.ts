import { TECH_VOCAB } from "./tech";

/** Turns a typed search like "quant internships chicago posted today" into structured filters + leftover free-text terms.
 *  Pure and dependency-free so it can be unit-tested. Anything it does not recognise stays a free-text term, so a query never
 *  silently loses words. Filters set explicitly in the filter bar always win over parsed ones (see lib/jobs.ts). */
export type ParsedSearch = {
  terms: string[];
  filters: {
    role?: string;              // comma-separated RoleCategory values
    exp?: string;               // ExperienceLevel
    season?: string; year?: string; remote?: string;
    location?: string;          // "|"-separated alternatives
    postedWithin?: string; discoveredWithin?: string;   // minutes
    techAll?: string;           // comma-separated, ALL must be mentioned
  };
  wantsCompanies: boolean;      // "companies with ..." -> also show a per-company summary
  explained: string[];          // human-readable chips: what the parser understood
};

const SWE_FAMILY = ["SWE", "BACKEND", "FRONTEND", "FULL_STACK", "INFRASTRUCTURE", "DISTRIBUTED_SYSTEMS"];
const ROLE_PATTERNS: [RegExp, string[], string][] = [   // most specific first; each match is consumed
  [/\bquant(?:itative)?\s+(?:developer|dev|engineer)s?\b/g, ["QUANT_DEVELOPER"], "Quant developer"],
  [/\bquant(?:itative)?\s+research(?:er)?s?\b/g, ["QUANT_RESEARCH"], "Quant research"],
  [/\bquant(?:itative)?\s+trad(?:ing|er)s?\b/g, ["QUANT_TRADING"], "Quant trading"],
  [/\bquant(?:itative)?\b/g, ["QUANT_DEVELOPER", "QUANT_RESEARCH", "QUANT_TRADING"], "Quant (all)"],
  [/\b(?:machine learning|ml|ai)\b/g, ["ML_AI"], "ML / AI"],
  [/\bdata\s+engineer(?:ing|s)?\b/g, ["DATA_ENGINEERING"], "Data engineering"],
  [/\b(?:dev\s?ops|sre)\b/g, ["DEVOPS_SRE"], "DevOps / SRE"],
  [/\bdistributed systems\b/g, ["DISTRIBUTED_SYSTEMS"], "Distributed systems"],
  [/\binfra(?:structure)?\b/g, ["INFRASTRUCTURE"], "Infrastructure"],
  [/\bback-?end\b/g, ["BACKEND"], "Backend"],
  [/\bfront-?end\b/g, ["FRONTEND"], "Frontend"],
  [/\bfull[- ]?stack\b/g, ["FULL_STACK"], "Full stack"],
  [/\bsecurity\b/g, ["SECURITY"], "Security"],
  [/\b(?:swe|software\s+(?:engineer(?:ing|s)?|developer|development))\b/g, SWE_FAMILY, "Software engineering"],
];
const LOCATIONS: [RegExp, string][] = [
  [/\b(?:nyc|new york(?: city)?)\b/g, "New York"], [/\b(?:sf|san francisco|bay area)\b/g, "San Francisco"],
  [/\bchicago\b/g, "Chicago"], [/\b(?:philly|philadelphia)\b/g, "Philadelphia"], [/\bboston\b/g, "Boston"],
  [/\bseattle\b/g, "Seattle"], [/\baustin\b/g, "Austin"], [/\blondon\b/g, "London"], [/\b(?:washington dc|dc)\b/g, "Washington"],
];
const STOP = new Set(["jobs", "job", "roles", "role", "positions", "position", "openings", "opening", "requiring", "require", "requires", "with", "in", "at",
  "for", "the", "a", "an", "and", "of", "from", "new", "posted", "discovered", "find", "show", "me", "that", "are", "is", "open", "hiring", "companies", "company", "any"]);

const WINDOWS: [RegExp, number, string][] = [
  [/\b(?:in the |within the )?last\s+(\d+)\s*(minutes?|mins?|hours?|hrs?|days?)\b/, -1, ""],   // computed below
  [/\blast\s+hour\b/, 60, "last hour"], [/\b(?:last\s+24\s*(?:hours|h)|past day)\b/, 1440, "last 24h"], [/\blast\s+week\b/, 10080, "last 7 days"],
  [/\bthis\s+week\b/, 10080, "last 7 days"], [/\bthis\s+month\b/, 43200, "last 30 days"], [/\btoday\b/, 1440, "last 24h"],
];


export function parseSearch(input: string | undefined | null): ParsedSearch {
  const out: ParsedSearch = { terms: [], filters: {}, wantsCompanies: false, explained: [] };
  if (!input?.trim()) return out;
  const quoted: string[] = [];
  let s = " " + input.toLowerCase().replace(/"([^"]+)"/g, (_, p: string) => { quoted.push(p.trim()); return " "; }) + " ";
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => { const m = s.match(re); if (m) { fn(m); s = s.replace(re, " "); return true; } return false; };

  // 1. time windows: "posted today" / "discovered this week" / bare "today"
  const kind = /\bposted\b/.test(s) ? "postedWithin" : "discoveredWithin";
  for (const [re, minutes, label] of WINDOWS) {
    if (take(re, (m) => {
      let mins = minutes, lab = label;
      if (minutes === -1) { const n = Number(m[1]); const u = m[2][0]; mins = u === "d" ? n * 1440 : u === "h" ? n * 60 : n; lab = `last ${n} ${m[2]}`; }
      out.filters[kind] = String(mins); out.explained.push(`${kind === "postedWithin" ? "Posted" : "Discovered"}: ${lab}`);
    })) break;
  }
  // 2. season / year ("spring" only with a year because "Spring" is also a Java framework)
  take(/\b(summer|fall|autumn|winter|spring)\s+(20[2-3]\d)\b/, (m) => { out.filters.season = cap(m[1] === "autumn" ? "fall" : m[1]); out.filters.year = m[2]; out.explained.push(`Season: ${out.filters.season} ${m[2]}`); });
  if (!out.filters.season) take(/\b(summer|fall|winter)\b/, (m) => { out.filters.season = cap(m[1]); out.explained.push(`Season: ${out.filters.season}`); });
  if (!out.filters.year) take(/\b(20[2-3]\d)\b/, (m) => { out.filters.year = m[1]; out.explained.push(`Year: ${m[1]}`); });
  // 3. experience level
  if (take(/\bnew[- ]?grads?\b/, () => { out.filters.exp = "NEW_GRAD"; out.explained.push("New grad"); })) { /* done */ }
  else if (take(/\bentry[- ]level\b/, () => { out.filters.exp = "ENTRY_LEVEL"; out.explained.push("Entry level"); })) { /* done */ }
  else take(/\b(?:internships?|interns?)\b/, () => { out.filters.exp = "INTERNSHIP"; out.explained.push("Internship"); });
  // 4. roles (accumulate)
  const roles: string[] = [];
  for (const [re, cats, label] of ROLE_PATTERNS) take(re, () => { for (const c of cats) if (!roles.includes(c)) roles.push(c); out.explained.push(`Role: ${label}`); });
  if (roles.length) out.filters.role = roles.join(",");
  // 5. remote, locations
  take(/\bremote\b/, () => { out.filters.remote = "1"; out.explained.push("Remote"); });
  const locs: string[] = [];
  for (const [re, name] of LOCATIONS) take(re, () => { if (!locs.includes(name)) locs.push(name); });
  if (locs.length) { out.filters.location = locs.join("|"); out.explained.push(`Location: ${locs.join(" or ")}`); }
  // 6. "companies ..." asks for a per-company summary
  out.wantsCompanies = /\bcompanies\b/.test(s);

  // 7. leftover tokens: known technologies become an ALL-of filter, stop words drop, the rest stay free text
  const techByLower = new Map(TECH_VOCAB.map((t) => [t.toLowerCase(), t]));
  const techs: string[] = [];
  const terms: string[] = [];
  for (const raw of s.split(/\s+/).filter(Boolean)) {
    const tok = raw.replace(/^[^\w+#.]+|[^\w+#]+$/g, "");   // keep C++, C#, node.js, .net inside the token
    if (!tok) continue;
    const tech = techByLower.get(tok);
    if (tech && !(tech === "Go" && raw !== tok) ) { if (!techs.includes(tech)) techs.push(tech); continue; }
    if (STOP.has(tok)) continue;
    terms.push(tok);
  }
  for (const q of quoted) if (q) terms.push(q);
  if (techs.length) { out.filters.techAll = techs.join(","); out.explained.push(`Mentions: ${techs.join(", ")}`); }
  out.terms = terms.slice(0, 8);
  return out;
}

function cap(w: string) { return w[0].toUpperCase() + w.slice(1); }
