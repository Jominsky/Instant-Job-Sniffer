import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { parseCompanyText, toCompanyData } from "@/lib/companyImport";

const Single = z.object({ name: z.string().min(1).max(120), careersUrl: z.string().url().max(500).optional().or(z.literal("")),
  website: z.string().url().max(500).optional().or(z.literal("")), category: z.string().optional(), priority: z.string().optional(),
  industry: z.string().max(100).optional(), tags: z.array(z.string().max(40)).max(20).optional() });
const Bulk = z.object({ text: z.string().min(1).max(200_000), listId: z.string().optional() });

export async function GET() {
  const [, err] = await apiUser();
  if (err) return err;
  return NextResponse.json(await prisma.company.findMany({ orderBy: [{ priority: "asc" }, { name: "asc" }] }));
}

/** POST {name,...} adds one company; POST {text} bulk-imports pasted names / CSV. Existing slugs are updated, not duplicated. */
export async function POST(req: Request) {
  const [, err] = await apiUser();
  if (err) return err;
  const body = await req.json().catch(() => null);
  const bulk = Bulk.safeParse(body);
  let rows;
  if (bulk.success) rows = parseCompanyText(bulk.data.text).slice(0, 2000);
  else {
    const one = Single.safeParse(body);
    if (!one.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    rows = [{ ...one.data, careersUrl: one.data.careersUrl || undefined, website: one.data.website || undefined }];
  }
  const valid = rows.map((r) => ({ r, d: toCompanyData(r) })).filter((x) => x.d.slug);
  let created = 0, updated = 0;
  const ids: string[] = [];
  for (const { d } of valid) {
    const existing = await prisma.company.findUnique({ where: { slug: d.slug } });
    if (existing) {
      // Only fill in blanks / improve ATS detection; never clobber user edits.
      const c = await prisma.company.update({ where: { id: existing.id }, data: {
        careersUrl: existing.careersUrl ?? d.careersUrl,
        ...(existing.atsProvider === "UNKNOWN" && d.atsProvider !== "UNKNOWN" ? { atsProvider: d.atsProvider, atsIdentifier: d.atsIdentifier } : {}) } });
      ids.push(c.id); updated++;
    } else {
      const c = await prisma.company.create({ data: d }); ids.push(c.id); created++;
    }
  }
  if (bulk.success && bulk.data.listId && ids.length)
    await prisma.companyListMember.createMany({ data: ids.map((companyId) => ({ companyListId: bulk.data.listId!, companyId })), skipDuplicates: true });
  return NextResponse.json({ created, updated, skipped: rows.length - valid.length });
}
