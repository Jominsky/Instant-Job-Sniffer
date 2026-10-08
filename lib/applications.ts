import { prisma } from "@/lib/db";
import type { ApplicationStatus, Prisma } from "@prisma/client";

/** Statuses meaning the application was actually submitted (used to stamp dateApplied). */
export const SUBMITTED: ApplicationStatus[] = ["APPLIED", "OA_RECEIVED", "OA_COMPLETED", "RECRUITER_SCREEN", "TECHNICAL_INTERVIEW", "FINAL_ROUND", "OFFER"];

/** Create or update an application, record the transition, and stamp dateApplied once. Never downgrades via `onlyIfNew`. */
export async function setApplicationStatus(userId: string, jobId: string, status: ApplicationStatus, opts: { onlyIfNew?: boolean; extra?: Prisma.ApplicationUncheckedUpdateInput } = {}) {
  const existing = await prisma.application.findUnique({ where: { userId_jobId: { userId, jobId } } });
  if (existing && opts.onlyIfNew) return existing;
  const stamp = SUBMITTED.includes(status) && !existing?.dateApplied ? { dateApplied: new Date() } : {};
  const app = existing
    ? await prisma.application.update({ where: { id: existing.id }, data: { status, ...stamp, ...opts.extra } })
        : await prisma.application.create({ data: { ...(opts.extra as Prisma.ApplicationUncheckedCreateInput), userId, jobId, status, ...stamp } });
  if (!existing || existing.status !== status) await prisma.applicationStatusChange.create({ data: { applicationId: app.id, status } });
  return app;
}
