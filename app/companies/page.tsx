import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { CompaniesManager } from "@/components/CompaniesManager";

export default async function CompaniesPage({ searchParams }: { searchParams: { list?: string } }) {
  const userId = await requireUserId();
  const [companies, lists] = await Promise.all([
    prisma.company.findMany({ where: searchParams.list ? { listMemberships: { some: { companyListId: searchParams.list } } } : {}, orderBy: [{ priority: "asc" }, { name: "asc" }] }),
    prisma.companyList.findMany({ where: { OR: [{ userId }, { isBuiltIn: true }] }, include: { _count: { select: { members: true } } }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="page">
      <div><h1 className="h1">Companies</h1><p className="text-sm muted">{companies.length} companies · only companies with a detected Greenhouse / Lever / Ashby board (or a public careers page) are scanned</p></div>
      <CompaniesManager companies={JSON.parse(JSON.stringify(companies))} lists={lists.map((l) => ({ id: l.id, name: l.name, count: l._count.members }))} activeList={searchParams.list} />
    </div>
  );
}
