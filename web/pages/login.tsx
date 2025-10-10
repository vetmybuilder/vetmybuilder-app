// web/pages/login.tsx
import Head from "next/head";
import { initFirebase } from "@/utils/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

export default function Login() {
  const auth = initFirebase();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/projects");
    } catch (e: any) {
      setErr(e.message || "Failed to login");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head>
        <title>Login • Vetmybuilder</title>
      </Head>

      <div className="mx-auto max-w-md px-4 sm:px-0" data-testid="login-page">
        <div className="card" data-testid="login-card">
          <h1 className="text-xl font-semibold mb-4" data-testid="login-title">
            Login
          </h1>

          <form
            onSubmit={onSubmit}
            className="space-y-3"
            aria-label="Sign in form"
            data-testid="login-form"
          >
            <label
              className="text-sm"
              htmlFor="login-email"
              data-testid="label-login-email"
            >
              Email
            </label>
            <input
              id="login-email"
              className="input"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              aria-required="true"
              data-testid="input-login-email"
            />

            <label
              className="text-sm"
              htmlFor="login-password"
              data-testid="label-login-password"
            >
              Password
            </label>
            <input
              id="login-password"
              className="input"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              aria-required="true"
              data-testid="input-login-password"
            />

            {err && (
              <p
                className="text-red-400 text-sm"
                role="alert"
                data-testid="login-error"
              >
                {err}
              </p>
            )}

            <button
              className="btn w-full"
              disabled={busy}
              aria-label="Sign in"
              data-testid="btn-login"
            >
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p
            className="text-sm text-zinc-500 mt-4"
            data-testid="login-to-register"
          >
            Don’t have an account?{" "}
            <Link
              href="/register"
              className="text-indigo-600 hover:text-indigo-500"
              data-testid="link-to-register"
            >
              Create one
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
