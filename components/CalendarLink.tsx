"use client";
import { useState } from "react";

export function CalendarLink({ hasLink }: { hasLink: boolean }) {
  const [url, setUrl] = useState(""); const [active, setActive] = useState(hasLink);
  return (
    <section className="card space-y-2 p-4"><h2 className="h2">Calendar feed</h2>
      <p className="text-xs muted">Subscribe in Google Calendar / Apple Calendar / Outlook (“add calendar from URL”) to see application deadlines, OA due dates, follow-ups and interviews.
        The link is a secret: anyone with it can read those dates. It is shown once; creating a new one invalidates the old one.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={async () => { const r = await fetch("/api/calendar/token", { method: "POST" }); if (r.ok) { setUrl((await r.json()).url); setActive(true); } }}>{active ? "Rotate link" : "Create link"}</button>
        {active && <button className="btn" onClick={async () => { await fetch("/api/calendar/token", { method: "DELETE" }); setUrl(""); setActive(false); }}>Disable link</button>}
        <a className="btn" href="/api/calendar">Download .ics once</a></div>
      {url && <input readOnly className="input font-mono text-xs" value={url} onFocus={(e) => e.currentTarget.select()} />}
    </section>
  );
}
