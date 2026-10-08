import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { limiters } from "@/lib/limits";

// Passwords are bcrypt-hashed; sessions are signed JWTs (httpOnly cookie, CSRF-protected by NextAuth).
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(creds) {
        if (!creds?.email || !creds?.password) return null;
        const email = creds.email.toLowerCase().trim();
        if (!limiters.login.check(email).ok) return null;   // brute-force protection: 8 attempts / 15 min / email
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !(await bcrypt.compare(creds.password, user.passwordHash))) return null;
        limiters.login.reset(email);
        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) { if (user) token.userId = (user as { id: string }).id; return token; },
    async session({ session, token }) { if (session.user) (session.user as { id?: string }).id = token.userId as string; return session; },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
