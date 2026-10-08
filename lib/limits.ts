import { createLimiter, type Limiter } from "./rateLimit";

// Singletons that survive Next.js hot reloads.
const g = globalThis as unknown as { __limiters?: Record<string, Limiter> };
g.__limiters ??= {
  api: createLimiter(300, 60_000),          // any authenticated API call, per user
  draft: createLimiter(10, 60_000),         // AI drafts (cost + abuse), per user
  login: createLimiter(8, 15 * 60_000),     // failed+successful sign-in attempts, per email
  feed: createLimiter(60, 60_000),          // public calendar feed, per token
};
export const limiters = g.__limiters;
