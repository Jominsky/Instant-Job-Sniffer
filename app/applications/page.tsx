import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { ApplicationsBoard } from "@/components/ApplicationsBoard";

export default async function ApplicationsPage({ searchParams }: { searchParams: { view?: string } }) {
  const userId = await requireUserId();
  const view = searchParams.view === "kanban" ? "kanban" : "table";
  const apps = await prisma.application.findMany({
    where: { userId, status: { not: "DISCOVERED" } }, orderBy: { updatedAt: "desc" },
    include: { job: { select: { id: true, title: true, applicationUrl: true, company: { select: { name: true } } } } },
  });
  return (
    <div className="page">
      <div className="flex items-end justify-between"><h1 className="h1">Applications</h1>
        <div className="flex gap-2"><Link className={`btn ${view === "table" ? "btn-primary" : ""}`} href="/applications">Table</Link><a className="btn" href="/api/applications/export">Export CSV</a><a className="btn" href="/api/calendar" title="Deadlines, OAs, follow-ups and interviews">Export calendar (.ics)</a><Link className={`btn ${view === "kanban" ? "btn-primary" : ""}`} href="/applications?view=kanban">Pipeline</Link></div></div>
      <ApplicationsBoard apps={JSON.parse(JSON.stringify(apps))} view={view} />
    </div>
  );
}
