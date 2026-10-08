"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form className="card w-full max-w-sm space-y-3 p-6" onSubmit={async (e) => {
        e.preventDefault(); setError("");
        const r = await signIn("credentials", { email, password, redirect: false });
        if (r?.error) setError("Invalid email or password"); else window.location.href = "/dashboard";
      }}>
        <h1 className="h1">Sign in to JobIntel</h1>
        <input className="input" type="email" placeholder="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-sm" style={{ color: "hsl(var(--danger))" }}>{error}</p>}
        <button className="btn btn-primary w-full py-2">Sign in</button>
      </form>
    </div>
  );
}
