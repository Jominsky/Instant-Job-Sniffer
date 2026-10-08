"use client";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

export function Shell({ newJobs, children }: { newJobs: number; children: React.ReactNode }) {
  const path = usePathname();
  if (path === "/login") return <>{children}</>;
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar newJobs={newJobs} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
