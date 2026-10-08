import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { ContactsManager } from "@/components/ContactsManager";

export default async function Contacts({ searchParams }: { searchParams: { companyId?: string } }) {
  const userId = await requireUserId();
  const [contacts, companies] = await Promise.all([
    prisma.contact.findMany({ where: { userId }, include: { company: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const rows = contacts.map(({ company, ...c }) => ({ ...c, companyName: company?.name ?? null }));
  return <div className="page"><h1 className="h1">Contacts & referrals</h1><ContactsManager contacts={JSON.parse(JSON.stringify(rows))} companies={companies} prefillCompanyId={searchParams.companyId} /></div>;
}
