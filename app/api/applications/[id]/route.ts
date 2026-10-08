import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { SUBMITTED } from "@/lib/applications";
import { APP_STATUSES } from "@/lib/format";

const date = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional();
const Body = z.object({
  status: z.enum(APP_STATUSES).optional(), dateApplied: date, oaDeadline: date, followUpDate: date,
  recruiter: z.string().max(200).nullable().optional(), applicationEmail: z.string().max(200).nullable().optional(),
  applicationAccountEmail: z.string().max(200).nullable().optional(), notes: z.string().max(10000).nullable().optional(),
  referral: z.boolean().optional(), result: z.string().max(500).nullable().optional(), resumeId: z.string().nullable().optional(),
  interviewDates: z.array(z.string()).max(20).optional(),
});
const toDate = (v?: string | null) => (v === undefined ? undefined : v === null ? null : new Date(v));

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const [userId, err] = await apiUser();
  if (err) return err;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid body", issues: p.error.issues }, { status: 400 });
  const own = await prisma.application.findFirst({ where: { id: params.id, userId } });
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { dateApplied, oaDeadline, followUpDate, interviewDates, ...rest } = p.data;
  const stamp = !own.dateApplied && p.data.status && SUBMITTED.includes(p.data.status) ? new Date() : undefined;
  const a = await prisma.application.update({
    where: { id: params.id },
    data: { ...rest, dateApplied: toDate(dateApplied) ?? stamp, oaDeadline: toDate(oaDeadline), followUpDate: toDate(followUpDate),
      interviewDates: interviewDates?.map((d) => new Date(d)) },
  });
  if (p.data.status && p.data.status !== own.status) await prisma.applicationStatusChange.create({ data: { applicationId: a.id, status: p.data.status } });
  return NextResponse.json(a);
}
