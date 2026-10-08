export { default } from "next-auth/middleware";
// Everything except login, NextAuth endpoints, the token-protected calendar feed and static assets requires a session.
export const config = { matcher: ["/((?!login|api/auth|api/calendar/feed|_next/static|_next/image|favicon.ico).*)"] };
