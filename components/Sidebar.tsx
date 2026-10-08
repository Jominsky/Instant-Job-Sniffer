"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Zap, Briefcase, ClipboardList, Building2, Settings, Activity, Menu, ListChecks, BellRing, FileText, Users, BarChart3 } from "lucide-react";
import clsx from "clsx";
import { useState } from "react";

// Only pages that exist are linked.
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/just-opened", label: "Just Opened", icon: Zap },
  { href: "/jobs", label: "All Jobs", icon: Briefcase },
  { href: "/watchlists", label: "Watchlists", icon: ListChecks },
  { href: "/applications", label: "Applications", icon: ClipboardList },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/alerts", label: "Alerts", icon: BellRing },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/resumes", label: "Resumes", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/admin", label: "Diagnostics", icon: Activity },
];

export function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn fixed bottom-4 right-4 z-30 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu"><Menu className="h-4 w-4" /></button>
      <aside className={clsx("sticky top-0 z-20 h-screen w-56 shrink-0 flex-col border-r bg-[hsl(var(--background))]", open ? "fixed flex" : "hidden md:flex")}
        style={{ borderColor: "hsl(var(--border))" }}>
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[hsl(var(--primary))]"><Zap className="h-4 w-4 text-[hsl(var(--primary-fg))]" /></div>
          <span className="text-sm font-semibold tracking-tight">JobIntel</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = path === href || path?.startsWith(href + "/");
            return (
              <Link key={href} href={href} onClick={() => setOpen(false)}
                className={clsx("flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "badge-primary font-medium" : "muted hover:bg-[hsl(var(--muted))]")}>
                <Icon className="h-4 w-4" />{label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 text-[11px] muted">Phase 1</div>
      </aside>
    </>
  );
}
