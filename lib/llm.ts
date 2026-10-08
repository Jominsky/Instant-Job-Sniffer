// Provider abstraction for text generation (server-side only; keys never reach the browser).
// Plain fetch, no vendor SDK, so no vendor lock-in. Mirrors worker/pipeline/providers.py env vars.
export type Llm = { name: string; complete(system: string, user: string): Promise<string> };
type Env = Record<string, string | undefined>;

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45_000);
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    if (!r.ok) throw new Error(`LLM provider returned HTTP ${r.status}`);   // never include the response body: it may echo prompts
    return await r.json();
  } finally { clearTimeout(t); }
}

export function getLlm(env: Env = process.env): Llm | null {
  const model = env.AI_DRAFT_MODEL || env.AI_MODEL;
  if (env.AI_PROVIDER === "anthropic" && env.ANTHROPIC_API_KEY) {
    return { name: "anthropic", async complete(system, user) {
      const d = await post("https://api.anthropic.com/v1/messages", { "x-api-key": env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
        { model: model || "claude-sonnet-5-5", max_tokens: 900, system, messages: [{ role: "user", content: user }] });
      return String(d?.content?.[0]?.text ?? "");
    } };
  }
  if (env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY) {
    return { name: "openai", async complete(system, user) {
      const d = await post("https://api.openai.com/v1/chat/completions", { authorization: `Bearer ${env.OPENAI_API_KEY}` },
        { model: model || "gpt-4o", max_tokens: 900, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
      return String(d?.choices?.[0]?.message?.content ?? "");
    } };
  }
  return null;
}
