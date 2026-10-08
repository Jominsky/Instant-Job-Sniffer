import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/Shell";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "JobIntel", description: "Real-time job & internship intelligence and application CRM" };
export const dynamic = "force-dynamic";

async function newToday() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  try { return await prisma.job.count({ where: { firstDiscoveredAt: { gte: start }, isExcluded: false } }); } catch { return 0; }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased"><Shell newJobs={await newToday()}>{children}</Shell></body>
    </html>
  );
}
