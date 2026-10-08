"use client";
import { useState } from "react";

/** Copies text to the clipboard; falls back to a hidden textarea where the Clipboard API is unavailable. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); }
    catch {
      try { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); } catch { return; }
    }
    setDone(true); setTimeout(() => setDone(false), 1500);
  }
  return <button type="button" className="btn" onClick={copy}>{done ? "Copied" : label}</button>;
}
