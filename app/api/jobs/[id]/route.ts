import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const [, err] = await apiUser();
  if (err) return err;
  const job = await prisma.job.findUnique({ where: { id: params.id }, include: { company: true, sources: true, versions: { orderBy: { version: "desc" } } } });
  return job ? NextResponse.json(job) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
