import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { limiters } from "@/lib/limits";
import type { Limiter } from "@/lib/rateLimit";

export async function getUserId(): Promise<string | null> {
  const s = await getServerSession(authOptions);
  return (s?.user as { id?: string } | undefined)?.id ?? null;
}

/** For pages: returns the id (middleware already guards routes). */
export async function requireUserId(): Promise<string> {
  const id = await getUserId();
  if (!id) throw new Error("Unauthorized");
  return id;
}

/** For API routes: returns [userId, null] or [null, 401 response]. */
export async function apiUser(limiter: Limiter = limiters.api): Promise<[string, null] | [null, NextResponse]> {
  const id = await getUserId();
  if (!id) return [null, NextResponse.json({ error: "Unauthorized" }, { status: 401 })];
  const r = limiter.check(id);
  if (!r.ok) return [null, NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(r.retryAfterSec) } })];
  return [id, null];
}
