import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { buildWhere, buildOrder, type Filters } from "@/lib/jobs";
import { toCsv } from "@/lib/csv";

/** CSV of the jobs matching the same filters as the All Jobs page (capped at 5,000 rows). */
export async function GET(req: Request) {
  const [userId, err] = await apiUser(); if (err) return err;
  const f = Object.fromEntries(new URL(req.url).searchParams) as Filters;
  const jobs = await prisma.job.findMany({ where: buildWhere(f, userId), orderBy: buildOrder(f.sort), take: 5000, include: { company: { select: { name: true } } } });
  const csv = toCsv(
    ["Company", "Title", "Role", "Level", "Location", "Work mode", "Season", "Year", "Pay", "Fit score", "Status", "Posted", "First seen", "Deadline", "Apply link"],
    jobs.map((j) => [j.company.name, j.title, j.roleCategory, j.experienceLevel, j.location, j.workMode, j.targetSeason, j.targetYear, j.compensationRaw, j.fitScore, j.status,
      j.datePosted, j.firstDiscoveredAt, j.applicationDeadline, j.applicationUrl]), { bom: true });
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="jobs.csv"', "Cache-Control": "no-store" } });
}
