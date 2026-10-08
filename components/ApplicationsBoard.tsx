"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { APP_STATUSES, label, relTime } from "@/lib/format";

export type AppRow = { id: string; status: string; dateApplied: string | null; dateDiscovered: string; followUpDate: string | null; notes: string | null; referral: boolean;
  job: { id: string; title: string; applicationUrl: string; company: { name: string } } };

export function ApplicationsBoard({ apps, view }: { apps: AppRow[]; view: "table" | "kanban" }) {
  const router = useRouter();
  async function setStatus(id: string, status: string) {
    await fetch(`/api/applications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    router.refresh();
  }
  const Select = ({ a }: { a: AppRow }) => (
    <select className="input w-auto py-1 text-xs" value={a.status} onChange={(e) => setStatus(a.id, e.target.value)}>
      {APP_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>);

  if (view === "kanban") {
    const cols = APP_STATUSES.filter((s) => s !== "DISCOVERED");
    return (
      <div className="flex gap-3 overflow-x-auto pb-3">
        {cols.map((s) => {
          const items = apps.filter((a) => a.status === s);
          return (
            <div key={s} className="w-64 shrink-0 space-y-2">
              <div className="flex items-center justify-between px-1 text-xs font-semibold"><span>{label(s)}</span><span className="muted">{items.length}</span></div>
              {items.map((a) => (
                <div key={a.id} className="card space-y-1.5 p-3">
                  <Link href={`/jobs/${a.job.id}`} className="text-sm font-medium hover:underline">{a.job.title}</Link>
                  <div className="text-xs muted">{a.job.company.name}{a.dateApplied ? ` · applied ${relTime(a.dateApplied)}` : ""}</div>
                  {a.followUpDate && <div className="badge badge-warning">Follow up {new Date(a.followUpDate).toLocaleDateString()}</div>}
                  <Select a={a} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs muted"><tr className="border-b" style={{ borderColor: "hsl(var(--border))" }}>{["Company", "Role", "Status", "Discovered", "Applied", "Follow-up", "Referral", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {apps.map((a) => (
            <tr key={a.id} className="border-b last:border-0" style={{ borderColor: "hsl(var(--border))" }}>
              <td className="px-3 py-2 font-medium">{a.job.company.name}</td>
              <td className="px-3 py-2"><Link className="hover:underline" href={`/jobs/${a.job.id}`}>{a.job.title}</Link></td>
              <td className="px-3 py-2"><Select a={a} /></td>
              <td className="px-3 py-2 text-xs">{relTime(a.dateDiscovered)}</td>
              <td className="px-3 py-2 text-xs">{a.dateApplied ? new Date(a.dateApplied).toLocaleDateString() : "—"}</td>
              <td className="px-3 py-2 text-xs">{a.followUpDate ? new Date(a.followUpDate).toLocaleDateString() : "—"}</td>
              <td className="px-3 py-2 text-xs">{a.referral ? "Yes" : "—"}</td>
              <td className="px-3 py-2"><a className="btn" href={a.job.applicationUrl} target="_blank" rel="noopener noreferrer">Open</a></td>
            </tr>
          ))}
          {apps.length === 0 && <tr><td colSpan={8} className="p-8 text-center muted">Nothing tracked yet. Save or Apply on a job to start.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
