"use client";
import { Search, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import Link from "next/link";
import { NotificationBell } from "@/components/NotificationBell";

export function TopBar({ newJobs }: { newJobs: number }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b px-4 backdrop-blur"
      style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--background) / .9)" }}>
      <form className="relative w-full max-w-md" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/jobs?q=${encodeURIComponent(q.trim())}&status=ANY`); }}>
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 muted" />
        <input className="input pl-9" placeholder='Search all jobs — e.g. "quant chicago", "C++", "Palantir"' value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <div className="flex items-center gap-3">
        <Link href="/just-opened" className="badge badge-primary whitespace-nowrap">{newJobs} new today</Link>
        <NotificationBell />
        <button className="btn" title="Sign out" onClick={() => signOut({ callbackUrl: "/login" })}><LogOut className="h-3.5 w-3.5" /></button>
      </div>
    </header>
  );
}
