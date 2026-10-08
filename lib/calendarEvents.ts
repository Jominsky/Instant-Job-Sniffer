import { prisma } from "@/lib/db";
import { buildIcs, type CalEvent } from "@/lib/ics";

/** Deadlines, OA dates, follow-ups and interviews for one user's active applications, as an .ics document. */
export async function calendarFor(userId: string): Promise<string> {
  const apps = await prisma.application.findMany({
    where: { userId, status: { notIn: ["REJECTED", "WITHDRAWN"] } },
    include: { job: { select: { title: true, applicationDeadline: true, applicationUrl: true, company: { select: { name: true } } } } },
  });
  const events: CalEvent[] = [];
  for (const a of apps) {
    const who = `${a.job.company.name} — ${a.job.title}`;
    if (a.job.applicationDeadline && !["APPLIED", "OFFER"].includes(a.status)) events.push({ uid: `deadline-${a.id}`, title: `Application deadline: ${who}`, date: a.job.applicationDeadline, url: a.job.applicationUrl });
    if (a.oaDeadline) events.push({ uid: `oa-${a.id}`, title: `OA due: ${who}`, date: a.oaDeadline });
    if (a.followUpDate) events.push({ uid: `follow-${a.id}`, title: `Follow up: ${who}`, date: a.followUpDate });
    a.interviewDates.forEach((d, i) => events.push({ uid: `int-${a.id}-${i}`, title: `Interview: ${who}`, date: d }));
  }
  return buildIcs(events);
}

export const icsHeaders = (inline: boolean) => ({ "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300",
  ...(inline ? {} : { "Content-Disposition": 'attachment; filename="jobintel.ics"' }) });
