import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { calendarFor, icsHeaders } from "@/lib/calendarEvents";

/** Authenticated one-off .ics download. For a subscribable URL see /api/calendar/token. */
export async function GET() {
  const [userId, err] = await apiUser(); if (err) return err;
  return new NextResponse(await calendarFor(userId), { headers: icsHeaders(false) });
}
