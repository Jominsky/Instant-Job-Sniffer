import { z } from "zod";
import type { Prisma } from "@prisma/client";

// Rule JSON used by alerts AND watchlists. Mirrors worker/alerts/rules.py (rule_matches); keep semantics in sync:
// every present key must match; lists are OR within a key; companyIds + categories are a UNION.
const EXP = ["INTERNSHIP", "NEW_GRAD", "ENTRY_LEVEL", "EXPERIENCED", "UNKNOWN"] as const;
const ROLES = ["SWE", "BACKEND", "FRONTEND", "FULL_STACK", "INFRASTRUCTURE", "DISTRIBUTED_SYSTEMS", "ML_AI", "DATA_ENGINEERING", "QUANT_DEVELOPER",
  "QUANT_RESEARCH", "QUANT_TRADING", "DEVOPS_SRE", "SECURITY", "PRODUCT", "OTHER"] as const;
const CATS = ["BIG_TECH", "QUANT", "HEDGE_FUND", "PROP_TRADING", "FINTECH", "FORTUNE_500", "STARTUP", "HEALTHCARE", "FINANCE", "OTHER"] as const;
const str = z.string().trim().min(1).max(60);

export const RuleSchema = z.object({
  minFit: z.number().min(0).max(100).optional(),
  experienceLevels: z.array(z.enum(EXP)).max(5).optional(),
  roleCategories: z.array(z.enum(ROLES)).max(15).optional(),
  seasons: z.array(z.enum(["Summer", "Fall", "Winter", "Spring"])).max(4).optional(),
  years: z.array(z.number().int().min(2020).max(2040)).max(6).optional(),
  statedSeasonOnly: z.boolean().optional(),
  companyIds: z.array(z.string().max(40)).max(500).optional(),
  categories: z.array(z.enum(CATS)).max(10).optional(),
  priorities: z.array(z.enum(["P0", "P1", "P2", "P3"])).max(4).optional(),
  keywords: z.array(str).max(30).optional(),
  locations: z.array(str).max(30).optional(),
  technologies: z.array(str).max(30).optional(),
}).strict();
export type Rule = z.infer<typeof RuleSchema>;
export const RULE_OPTIONS = { EXP, ROLES, CATS };

export function hasCriteria(r: Rule | null | undefined): boolean {
  return !!r && Object.entries(r).some(([k, v]) => k !== "statedSeasonOnly" && (Array.isArray(v) ? v.length > 0 : v != null));
}

export function ruleToWhere(r: Rule): Prisma.JobWhereInput {
  const and: Prisma.JobWhereInput[] = [];
  if (r.minFit != null) and.push({ fitScore: { gte: r.minFit } });
  if (r.experienceLevels?.length) and.push({ experienceLevel: { in: r.experienceLevels } });
  if (r.roleCategories?.length) and.push({ roleCategory: { in: r.roleCategories } });
  if (r.seasons?.length) and.push({ targetSeason: { in: r.seasons } });
  if (r.years?.length) and.push({ targetYear: { in: r.years } });
  if ((r.seasons?.length || r.years?.length) && r.statedSeasonOnly) and.push({ seasonProvenance: "ATS" });
  if (r.companyIds?.length || r.categories?.length)
    and.push({ OR: [...(r.companyIds?.length ? [{ companyId: { in: r.companyIds } }] : []), ...(r.categories?.length ? [{ company: { category: { in: r.categories } } }] : [])] });
  if (r.priorities?.length) and.push({ company: { priority: { in: r.priorities } } });
  if (r.keywords?.length) and.push({ OR: r.keywords.flatMap((k) => [{ title: { contains: k, mode: "insensitive" as const } }, { description: { contains: k, mode: "insensitive" as const } }]) });
  if (r.locations?.length) and.push({ OR: r.locations.map((l) => l.toLowerCase() === "remote" ? { workMode: "REMOTE" as const } : { location: { contains: l, mode: "insensitive" as const } }) });
  if (r.technologies?.length) and.push({ technologies: { hasSome: r.technologies } });
  return { AND: and };
}

export function describeRule(r: Rule, companyNames: Record<string, string> = {}): string {
  const p: string[] = [];
  if (r.minFit != null) p.push(`fit ≥ ${r.minFit}`);
  if (r.experienceLevels?.length) p.push(r.experienceLevels.map((x) => x.replace("_", " ").toLowerCase()).join("/"));
  if (r.seasons?.length || r.years?.length) p.push([r.seasons?.join("/"), r.years?.join("/")].filter(Boolean).join(" ") + (r.statedSeasonOnly ? " (stated)" : ""));
  if (r.roleCategories?.length) p.push(r.roleCategories.map((x) => x.replaceAll("_", " ").toLowerCase()).join(", "));
  const scope = [...(r.companyIds ?? []).map((id) => companyNames[id] ?? "?"), ...(r.categories ?? []).map((c) => `any ${c.replace("_", " ").toLowerCase()} firm`)];
  if (scope.length) p.push(`at ${scope.join(", ")}`);
  if (r.priorities?.length) p.push(`priority ${r.priorities.join("/")}`);
  if (r.locations?.length) p.push(`in ${r.locations.join(", ")}`);
  if (r.technologies?.length) p.push(`tech: ${r.technologies.join(", ")}`);
  if (r.keywords?.length) p.push(`keywords: ${r.keywords.join(", ")}`);
  return p.join(" · ") || "(no criteria)";
}
