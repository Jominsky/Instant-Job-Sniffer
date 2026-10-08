import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function tryTs(base) { for (const c of [base + ".ts", path.join(base, "index.ts")]) if (fs.existsSync(c)) return pathToFileURL(c).href; return null; }
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) { const u = tryTs(path.join(root, specifier.slice(2))); if (u) return { url: u, shortCircuit: true }; }
  if (specifier.startsWith(".") && !path.extname(specifier) && context.parentURL) {
    const u = tryTs(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)); if (u) return { url: u, shortCircuit: true };
  }
  return next(specifier, context);
}
