import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { setApplicationStatus } from "@/lib/applications";

const Body = z.object({ action: z.enum(["save", "unsave", "not_interested", "applying", "priority"]), priority: z.enum(["HIGH", "NORMAL", "LOW"]).optional() })
  .refine((b) => b.action !== "priority" || b.priority, { message: "priority is required" });

/** Applying only records the user's own click ("Applying"); we never submit anything on their behalf. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const [userId, err] = await apiUser();
  if (err) return err;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const job = await prisma.job.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const key = { userId_jobId: { userId, jobId: job.id } };

  switch (parsed.data.action) {
    case "save":
      await prisma.savedJob.upsert({ where: key, create: { userId, jobId: job.id }, update: { notInterested: false } });
      await setApplicationStatus(userId, job.id, "SAVED", { onlyIfNew: true });
      break;
    case "unsave":
      await prisma.savedJob.deleteMany({ where: { userId, jobId: job.id } });
      await prisma.application.updateMany({ where: { userId, jobId: job.id, status: "SAVED" }, data: { status: "DISCOVERED" } });
      break;
    case "not_interested":
      await prisma.savedJob.upsert({ where: key, create: { userId, jobId: job.id, notInterested: true }, update: { notInterested: true } });
      break;
    case "priority": {
      const priority = parsed.data.priority!;
      if (priority === "NORMAL") await prisma.savedJob.updateMany({ where: { userId, jobId: job.id }, data: { priority } });   // normal is the default: never creates a record
      else {   // flagging a job HIGH or LOW also saves it
        await prisma.savedJob.upsert({ where: key, create: { userId, jobId: job.id, priority }, update: { priority, notInterested: false } });
        await setApplicationStatus(userId, job.id, "SAVED", { onlyIfNew: true });
      }
      break;
    }
    case "applying":
      await setApplicationStatus(userId, job.id, "APPLYING", { onlyIfNew: true }); // never downgrade an existing later-stage status
      break;
  }
  return NextResponse.json({ ok: true });
}
