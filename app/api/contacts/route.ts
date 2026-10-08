import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ContactBody } from "@/lib/schemas";

// Contacts are private to the signed-in user; this app never emails, messages or scrapes anyone.
export async function GET() {
  const [userId, err] = await apiUser(); if (err) return err;
  return NextResponse.json(await prisma.contact.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }));
}
export async function POST(req: Request) {
  const [userId, err] = await apiUser(); if (err) return err;
  const p = ContactBody.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid contact", issues: p.error.issues }, { status: 400 });
  const { lastContactedAt, linkedinUrl, email, ...rest } = p.data;
  const c = await prisma.contact.create({ data: { userId, ...rest, linkedinUrl: linkedinUrl || null, email: email || null, lastContactedAt: lastContactedAt ? new Date(lastContactedAt) : null } });
  return NextResponse.json(c);
}
