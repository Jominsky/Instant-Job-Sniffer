"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { relTime } from "@/lib/format";

type N = { id: string; title: string; body: string; jobId: string | null; read: boolean; createdAt: string };

export function NotificationBell() {
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const seen = useRef<Set<string> | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json() as { items: N[]; unread: number };
      setItems(d.items); setUnread(d.unread);
      // Browser notifications: only while a tab is open (no service-worker push in Phase 2).
      if (seen.current && typeof Notification !== "undefined" && Notification.permission === "granted")
        d.items.filter((n) => !n.read && !seen.current!.has(n.id)).slice(0, 3).forEach((n) => new Notification(n.title, { body: n.body.split("\n")[0] }));
      seen.current = new Set(d.items.map((n) => n.id));
    } catch { /* offline: ignore */ }
  }
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);
  async function markAll() { await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); load(); }

  return (
    <div className="relative">
      <button className="btn relative" onClick={() => setOpen(!open)} aria-label="Notifications"><Bell className="h-3.5 w-3.5" />
        {unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-[hsl(var(--danger))] px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}</button>
      {open && (
        <div className="card absolute right-0 z-30 mt-2 w-80 max-w-[90vw] space-y-2 p-3 shadow-lg">
          <div className="flex items-center justify-between"><b className="text-sm">Notifications</b><button className="text-xs underline muted" onClick={markAll}>Mark all read</button></div>
          {typeof Notification !== "undefined" && Notification.permission === "default" &&
            <button className="btn w-full" onClick={async () => { await Notification.requestPermission(); load(); }}>Enable browser notifications</button>}
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {items.map((n) => (
              <Link key={n.id} href={n.jobId ? `/jobs/${n.jobId}` : "/alerts"} onClick={() => setOpen(false)} className="block rounded-md p-2 text-xs hover:bg-[hsl(var(--muted))]">
                <div className={n.read ? "" : "font-semibold"}>{n.title}</div><div className="muted">{relTime(n.createdAt)}</div></Link>))}
            {items.length === 0 && <p className="text-xs muted">No notifications yet. Create an alert on the Alerts page.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
