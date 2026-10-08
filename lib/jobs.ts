import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseSearch } from "@/lib/searchQuery";

export type Filters = {
  q?: string; role?: string; companyId?: string; category?: string; location?: string; remote?: string;
  exp?: string; season?: string; year?: string; minFit?: string; discoveredWithin?: string; postedWithin?: string;
  tech?: string; techAll?: string; priority?: string; industry?: string; ats?: string; applied?: string; saved?: string; newOnly?: string; showExcluded?: string;
  status?: string; sort?: string; page?: string;
};

export const PAGE_SIZE = 25;
const num = (s?: string) => (s && !Number.isNaN(Number(s)) ? Number(s) : undefined);

export function buildWhere(input: Filters, userId: string): Prisma.JobWhereInput {
  // "quant internships chicago posted today" -> structured filters + leftover terms. Filter-bar values win over parsed ones.
  const parsed = parseSearch(input.q);
  const explicit = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== ""));
  const f = { ...parsed.filters, ...explicit } as Filters;
  const and: Prisma.JobWhereInput[] = [];
  if (f.status !== "ANY") and.push({ status: (f.status as never) || "OPEN" });
  if (f.showExcluded !== "1") and.push({ isExcluded: false });

  // Free-text search over every historical job: title, company, description, technologies.
  for (const term of parsed.terms) {
    and.push({ OR: [
      { title: { contains: term, mode: "insensitive" } },
      { company: { name: { contains: term, mode: "insensitive" } } },
      { location: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { technologies: { has: term } },
      { targetYear: num(term) },
    ] });
  }
  if (f.techAll) and.push({ technologies: { hasEvery: f.techAll.split(",").map((t) => t.trim()).filter(Boolean) } });
  if (f.role) and.push({ roleCategory: { in: f.role.split(",").filter(Boolean) as never[] } });
  if (f.companyId) and.push({ companyId: f.companyId });
  if (f.category) and.push({ company: { category: f.category as never } });
  if (f.industry?.trim()) and.push({ company: { industry: { contains: f.industry.trim(), mode: "insensitive" } } });
  if (f.location) and.push({ OR: f.location.split("|").filter(Boolean).map((l) => ({ location: { contains: l.trim(), mode: "insensitive" as const } })) });
  if (f.remote === "1") and.push({ workMode: "REMOTE" });
  if (f.exp) and.push({ experienceLevel: f.exp as never });
  if (f.season) and.push({ targetSeason: f.season });
  if (num(f.year)) and.push({ targetYear: num(f.year) });
  if (num(f.minFit)) and.push({ fitScore: { gte: num(f.minFit) } });
  if (num(f.discoveredWithin)) and.push({ firstDiscoveredAt: { gte: new Date(Date.now() - num(f.discoveredWithin)! * 60000) } });
  if (num(f.postedWithin)) and.push({ datePosted: { gte: new Date(Date.now() - num(f.postedWithin)! * 60000) } });
  if (f.tech) and.push({ technologies: { hasSome: f.tech.split(",").map((t) => t.trim()).filter(Boolean) } });
  if (f.ats) and.push({ ats: f.ats as never });
  if (f.newOnly === "1") and.push({ firstDiscoveredAt: { gte: new Date(Date.now() - 24 * 3600_000) } });
  if (f.applied === "1") and.push({ applications: { some: { userId, status: { notIn: ["DISCOVERED", "INTERESTED", "SAVED"] } } } });
  if (f.applied === "0") and.push({ applications: { none: { userId, status: { notIn: ["DISCOVERED", "INTERESTED", "SAVED"] } } } });
  if (f.priority === "HIGH" || f.priority === "LOW") and.push({ savedBy: { some: { userId, priority: f.priority, notInterested: false } } });
  if (f.saved === "1") and.push({ savedBy: { some: { userId, notInterested: false } } });
  // Jobs the user dismissed never reappear in feeds.
  and.push({ savedBy: { none: { userId, notInterested: true } } });
  return { AND: and };
}

export function buildOrder(sort?: string): Prisma.JobOrderByWithRelationInput[] {
  switch (sort) {
    case "newest_posted": return [{ datePosted: { sort: "desc", nulls: "last" } }, { firstDiscoveredAt: "desc" }];
    case "best_match": return [{ fitScore: { sort: "desc", nulls: "last" } }, { firstDiscoveredAt: "desc" }];
    case "company_priority": return [{ company: { priority: "asc" } }, { fitScore: { sort: "desc", nulls: "last" } }];
    case "deadline": return [{ applicationDeadline: { sort: "asc", nulls: "last" } }, { firstDiscoveredAt: "desc" }];
    case "compensation": return [{ compensationAnnualMax: { sort: "desc", nulls: "last" } }, { compensationMax: { sort: "desc", nulls: "last" } }];   // annualised; legacy rows fall back to their (annual) max
    default: return [{ firstDiscoveredAt: "desc" }];
  }
}

export const jobInclude = { company: { select: { id: true, name: true, logoUrl: true, priority: true, category: true } } } satisfies Prisma.JobInclude;

/** Fetch a page of jobs plus the current user's saved/application state for each. */
export async function queryJobs(f: Filters, userId: string, take = PAGE_SIZE, extraWhere?: Prisma.JobWhereInput) {
  const where: Prisma.JobWhereInput = extraWhere ? { AND: [buildWhere(f, userId), extraWhere] } : buildWhere(f, userId);
  const page = Math.max(1, num(f.page) ?? 1);
  const [rows, total] = await Promise.all([
    prisma.job.findMany({ where, orderBy: buildOrder(f.sort), include: jobInclude, take, skip: (page - 1) * take }),
    prisma.job.count({ where }),
  ]);
  return { jobs: await decorate(rows, userId), total, page, pages: Math.max(1, Math.ceil(total / take)) };
}

export async function decorate<T extends { id: string }>(rows: T[], userId: string) {
  const ids = rows.map((r) => r.id);
  const companyIds = Array.from(new Set(rows.map((r) => (r as unknown as { companyId?: string }).companyId).filter(Boolean))) as string[];
  const [saved, apps, referralCos] = await Promise.all([
    prisma.savedJob.findMany({ where: { userId, jobId: { in: ids } } }),
    prisma.application.findMany({ where: { userId, jobId: { in: ids } }, select: { jobId: true, status: true } }),
    prisma.contact.findMany({ where: { userId, companyId: { in: companyIds } }, select: { companyId: true }, distinct: ["companyId"] }),
  ]);
  const ref = new Set(referralCos.map((c) => c.companyId));
  const s = new Set(saved.filter((x) => !x.notInterested).map((x) => x.jobId));
  const a = new Map(apps.map((x) => [x.jobId, x.status]));
  const pr = new Map(saved.map((x) => [x.jobId, x.priority]));
  return rows.map((r) => ({ ...r, isSaved: s.has(r.id), applicationStatus: a.get(r.id) ?? null, priority: pr.get(r.id) ?? "NORMAL",
    hasReferral: ref.has((r as unknown as { companyId?: string }).companyId ?? "") }));
}

/** "Which companies have matching jobs?" Used when the search asks for companies ("companies with internships discovered this week"). */
export async function companySummary(f: Filters, userId: string, take = 15) {
  const rows = await prisma.job.groupBy({ by: ["companyId"], where: buildWhere(f, userId), _count: { _all: true }, orderBy: { _count: { companyId: "desc" } }, take });
  const names = await prisma.company.findMany({ where: { id: { in: rows.map((r) => r.companyId) } }, select: { id: true, name: true } });
  const nm = new Map(names.map((c) => [c.id, c.name]));
  return rows.map((r) => ({ id: r.companyId, name: nm.get(r.companyId) ?? "Unknown", count: r._count._all }));
}
