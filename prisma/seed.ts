/**
 * Seed script.
 *   npm run seed                 -> user + profile + editable starter companies/lists (NO fake jobs)
 *   npm run seed -- --demo       -> additionally add clearly-labelled SAMPLE jobs (company "Demo Co (sample data)")
 *   npm run seed -- --clear-demo -> remove the sample jobs/company again
 * Idempotent: safe to re-run.
 */
import { PrismaClient, CompanyCategory as Cat, CompanyPriority as Pri } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const slugify = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

type C = { name: string; cat: Cat; pri: Pri; url?: string; ats?: "GREENHOUSE" | "LEVER" | "ASHBY"; id?: string; industry?: string };
// Careers URLs below are best-effort starting points; the ATS board token is auto-detected from them.
// If a board 404s, the Diagnostics page will show it and you can fix the URL on the Companies page.
const COMPANIES: C[] = [
  { name: "Google", cat: "BIG_TECH", pri: "P0" }, { name: "Microsoft", cat: "BIG_TECH", pri: "P1" }, { name: "Meta", cat: "BIG_TECH", pri: "P0" },
  { name: "Amazon", cat: "BIG_TECH", pri: "P2" }, { name: "Apple", cat: "BIG_TECH", pri: "P1" }, { name: "NVIDIA", cat: "BIG_TECH", pri: "P0" },
  { name: "Palantir", cat: "BIG_TECH", pri: "P0", url: "https://jobs.lever.co/palantir" },
  { name: "Stripe", cat: "FINTECH", pri: "P0", url: "https://boards.greenhouse.io/stripe", industry: "Fintech" },
  { name: "Databricks", cat: "BIG_TECH", pri: "P0", url: "https://job-boards.greenhouse.io/databricks" },
  { name: "Snowflake", cat: "BIG_TECH", pri: "P2" },
  { name: "Cloudflare", cat: "BIG_TECH", pri: "P1", url: "https://boards.greenhouse.io/cloudflare" },
  { name: "MongoDB", cat: "BIG_TECH", pri: "P2", url: "https://boards.greenhouse.io/mongodb" },
  { name: "Uber", cat: "BIG_TECH", pri: "P2" },
  { name: "Airbnb", cat: "BIG_TECH", pri: "P2", url: "https://boards.greenhouse.io/airbnb" },
  { name: "Roblox", cat: "BIG_TECH", pri: "P2", url: "https://boards.greenhouse.io/roblox" },
  { name: "Coinbase", cat: "FINTECH", pri: "P2", url: "https://boards.greenhouse.io/coinbase", industry: "Fintech" },
  { name: "Bloomberg", cat: "FINTECH", pri: "P1", industry: "Financial data" },
  { name: "Jane Street", cat: "PROP_TRADING", pri: "P0" }, { name: "Citadel", cat: "HEDGE_FUND", pri: "P0" },
  { name: "Citadel Securities", cat: "QUANT", pri: "P0" }, { name: "Two Sigma", cat: "HEDGE_FUND", pri: "P1" },
  { name: "Hudson River Trading", cat: "PROP_TRADING", pri: "P0" }, { name: "SIG", cat: "PROP_TRADING", pri: "P0" },
  { name: "DRW", cat: "PROP_TRADING", pri: "P1" }, { name: "Optiver", cat: "PROP_TRADING", pri: "P1" }, { name: "IMC", cat: "PROP_TRADING", pri: "P1" },
  { name: "Jump Trading", cat: "PROP_TRADING", pri: "P1" }, { name: "Five Rings", cat: "PROP_TRADING", pri: "P1" },
  { name: "D. E. Shaw", cat: "HEDGE_FUND", pri: "P1" }, { name: "Point72", cat: "HEDGE_FUND", pri: "P2" }, { name: "Millennium", cat: "HEDGE_FUND", pri: "P2" },
  { name: "Xantium", cat: "QUANT", pri: "P2" }, { name: "Garda Capital Partners", cat: "HEDGE_FUND", pri: "P2" },
];
const LISTS: Record<string, string[]> = {
  "Major technology companies": ["Google", "Microsoft", "Meta", "Amazon", "Apple", "NVIDIA", "Palantir", "Databricks", "Snowflake", "Cloudflare", "MongoDB", "Uber", "Airbnb", "Roblox"],
  "Fortune 500 technology employers": ["Microsoft", "Apple", "Amazon", "Google", "Meta", "NVIDIA"],
  "Top quantitative trading firms": ["Jane Street", "Citadel Securities", "Hudson River Trading", "SIG", "DRW", "Optiver", "IMC", "Jump Trading", "Five Rings", "Xantium"],
  "Major hedge funds": ["Citadel", "Two Sigma", "D. E. Shaw", "Point72", "Millennium", "Garda Capital Partners"],
  "Top fintech companies": ["Stripe", "Coinbase", "Bloomberg"],
};

async function seedBase() {
  const email = (process.env.SEED_USER_EMAIL ?? "demo@example.com").toLowerCase();
  const password = process.env.SEED_USER_PASSWORD ?? "changeme-now";
  const user = await prisma.user.upsert({
    where: { email }, update: {},
    create: { email, name: "You", passwordHash: await bcrypt.hash(password, 12) },
  });
  await prisma.profile.upsert({
    where: { userId: user.id }, update: {},
    create: {
      userId: user.id, skills: ["Python", "Java", "C++", "SQL"], technologies: ["Linux", "React"], majors: ["Computer Science"],
      graduationYear: 2028, preferredRoles: ["SWE", "QUANT_DEVELOPER", "QUANT_RESEARCH", "QUANT_TRADING", "BACKEND", "ML_AI"],
      preferredLocations: ["New York", "Chicago", "Philadelphia"], targetSeason: "Summer", targetYear: 2027,
    },
  });

  const byName = new Map<string, string>();
  for (const c of COMPANIES) {
    const { ats, identifier } = c.url ? detect(c.url) : { ats: "UNKNOWN" as const, identifier: null };
    const row = await prisma.company.upsert({
      where: { slug: slugify(c.name) }, update: {},
      create: {
        name: c.name, slug: slugify(c.name), category: c.cat, priority: c.pri, careersUrl: c.url ?? null, industry: c.industry ?? null,
        atsProvider: ats, atsIdentifier: identifier, tags: [],
        notes: c.url ? "Starter list: board token unverified — check Diagnostics after first scan." : "Starter list: add this company's careers URL (Greenhouse/Lever/Ashby link) to enable scanning.",
      },
    });
    byName.set(c.name, row.id);
  }
  for (const [name, members] of Object.entries(LISTS)) {
    const existing = await prisma.companyList.findFirst({ where: { name, isBuiltIn: true } });
    const list = existing ?? await prisma.companyList.create({ data: { name, isBuiltIn: true, description: "Starter list (editable)" } });
    await prisma.companyListMember.createMany({ data: members.filter((m) => byName.has(m)).map((m) => ({ companyListId: list.id, companyId: byName.get(m)! })), skipDuplicates: true });
  }
  console.log(`Seeded user ${email}${process.env.SEED_USER_PASSWORD ? "" : ` (password: ${password} — CHANGE IT / set SEED_USER_PASSWORD)`}, ${COMPANIES.length} companies, ${Object.keys(LISTS).length} lists.`);
}

function detect(url: string): { ats: "GREENHOUSE" | "LEVER" | "ASHBY" | "UNKNOWN"; identifier: string | null } {
  let m = url.match(/(?:boards|job-boards)\.greenhouse\.io\/([\w-]+)/i); if (m) return { ats: "GREENHOUSE", identifier: m[1] };
  m = url.match(/jobs\.lever\.co\/([\w-]+)/i); if (m) return { ats: "LEVER", identifier: m[1] };
  m = url.match(/jobs\.ashbyhq\.com\/([\w.%-]+)/i); if (m) return { ats: "ASHBY", identifier: m[1] };
  return { ats: "UNKNOWN", identifier: null };
}

async function seedDemo() {
  const co = await prisma.company.upsert({
    where: { slug: "demo-co" }, update: {},
    create: { name: "Demo Co (sample data)", slug: "demo-co", category: "OTHER", priority: "P0", isActive: false, atsProvider: "UNKNOWN",
      notes: "SAMPLE DATA ONLY. These jobs are fictional; delete with `npm run seed -- --clear-demo`.", tags: ["demo"] },
  });
  const now = Date.now();
  const mk = (i: number, title: string, role: never, exp: never, loc: string, minsAgo: number, fit: number, techs: string[]) => ({
    companyId: co.id, title, normalizedTitle: title.toLowerCase(), location: loc, workMode: "UNKNOWN" as const, experienceLevel: exp, roleCategory: role,
    description: `SAMPLE DATA — fictional posting for UI development. ${title}.`, technologies: techs, applicationUrl: `https://example.com/demo/${i}`,
    sourceUrl: `https://example.com/demo/${i}`, ats: "UNKNOWN" as const, source: "demo", externalJobId: `demo-${i}`, dedupeKey: `demo-${i}`,
    datePosted: new Date(now - minsAgo * 60000), firstDiscoveredAt: new Date(now - minsAgo * 60000 + 120000), targetSeason: "Summer", targetYear: 2027,
    seasonProvenance: "ATS" as const, fitScore: fit, fitExplanation: { reasons: ["Sample reason: Python listed", "Sample reason: preferred location"] },
    concerns: [], postingHash: `demo-${i}`, urgencyScore: 80,
  });
  const jobs = [
    mk(1, "Software Engineering Intern, Summer 2027", "SWE" as never, "INTERNSHIP" as never, "New York, NY", 6, 94, ["Python", "Java"]),
    mk(2, "Quantitative Developer Intern, Summer 2027", "QUANT_DEVELOPER" as never, "INTERNSHIP" as never, "Chicago, IL", 40, 91, ["C++", "Linux"]),
    mk(3, "Machine Learning Engineer Intern", "ML_AI" as never, "INTERNSHIP" as never, "Remote", 300, 78, ["Python", "PyTorch"]),
    mk(4, "Backend Engineer, New Grad", "BACKEND" as never, "NEW_GRAD" as never, "Philadelphia, PA", 1500, 66, ["Go", "SQL"]),
  ];
  for (const j of jobs) {
    const row = await prisma.job.upsert({ where: { companyId_ats_externalJobId: { companyId: co.id, ats: "UNKNOWN", externalJobId: j.externalJobId } }, update: {}, create: j });
    const has = await prisma.jobVersion.count({ where: { jobId: row.id } });
    if (!has) await prisma.jobVersion.create({ data: { jobId: row.id, version: 1, snapshot: { title: j.title }, postingHash: j.postingHash } });
  }
  console.log("Added 4 SAMPLE jobs under 'Demo Co (sample data)'.");
}

async function main() {
  if (process.argv.includes("--clear-demo")) {
    await prisma.company.deleteMany({ where: { slug: "demo-co" } });
    console.log("Removed demo company and its sample jobs.");
    return;
  }
  await seedBase();
  if (process.argv.includes("--demo")) await seedDemo();
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
