import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { setApplicationStatus } from "@/lib/applications";
import { APP_STATUSES } from "@/lib/format";

const Body = z.object({ jobId: z.string().min(1), status: z.enum(APP_STATUSES).default("INTERESTED") });

export async function POST(req: Request) {
  const [userId, err] = await apiUser();
  if (err) return err;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  return NextResponse.json(await setApplicationStatus(userId, p.data.jobId, p.data.status));
}
