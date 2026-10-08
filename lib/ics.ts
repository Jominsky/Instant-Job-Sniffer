// Minimal RFC 5545 calendar export (pure). Dates become all-day events; times of day are not tracked in Phase 3.
export type CalEvent = { uid: string; title: string; date: Date; description?: string; url?: string };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
// RFC 5545: lines are folded at 75 octets; continuation lines start with a space.
function fold(line: string): string {
  const out: string[] = []; let cur = ""; let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(events: CalEvent[], now: Date = new Date()): string {
  const stamp = `${ymd(now)}T${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//JobIntel//Recruiting//EN", "CALSCALE:GREGORIAN"];
  for (const e of events) {
    const end = new Date(e.date.getTime() + 86400_000);
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@jobintel`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(end)}`,
      `SUMMARY:${esc(e.title)}`, ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []), ...(e.url ? [`URL:${e.url}`] : []), "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
