import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { queryJobs, Filters } from "@/lib/jobs";

export async function GET(req: NextRequest) {
  const [userId, err] = await apiUser();
  if (err) return err;
  const f = Object.fromEntries(req.nextUrl.searchParams) as Filters;
  const { jobs, total, page, pages } = await queryJobs(f, userId);
  return NextResponse.json({ jobs, total, page, pages });
}
