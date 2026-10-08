import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv";

/** CSV of the signed-in user's own tracked applications. */
export async function GET() {
  const [userId, err] = await apiUser(); if (err) return err;
  const apps = await prisma.application.findMany({ where: { userId, status: { not: "DISCOVERED" } }, orderBy: { updatedAt: "desc" },
    include: { job: { select: { title: true, applicationUrl: true, company: { select: { name: true } } } }, resume: { select: { label: true } } } });
  const csv = toCsv(
    ["Company", "Role", "Status", "Date applied", "Resume used", "OA deadline", "Interview dates", "Follow-up date", "Notes", "Apply link"],
    apps.map((a) => [a.job.company.name, a.job.title, a.status, a.dateApplied, a.resume?.label, a.oaDeadline, a.interviewDates.map((d) => d.toISOString().slice(0, 10)).join("; "),
      a.followUpDate, a.notes, a.job.applicationUrl]), { bom: true });
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="applications.csv"', "Cache-Control": "no-store" } });
}
