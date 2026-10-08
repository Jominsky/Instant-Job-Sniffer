import { label } from "@/lib/format";

export function FitBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return null;
  const cls = score >= 85 ? "badge-success" : score >= 65 ? "badge-primary" : "";
  return <span className={`badge ${cls} font-bold`}>{score}% Match</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const good = ["OFFER"], bad = ["REJECTED", "CLOSED", "APPLICATION_REMOVED"], mid = ["POSSIBLY_CLOSED", "APPLYING"];
  const cls = good.includes(status) ? "badge-success" : bad.includes(status) ? "badge-danger" : mid.includes(status) ? "badge-warning"
    : ["DISCOVERED", "WITHDRAWN"].includes(status) ? "" : "badge-primary";
  return <span className={`badge ${cls}`}>{label(status)}</span>;
}
