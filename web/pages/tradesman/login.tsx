import { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

export default function TradesmanLoginAlias() {
  const router = useRouter();

  useEffect(() => {
    try {
      // Ensure auth flow returns to vendor register after login
      sessionStorage.setItem("vmb:returnTo", "/tradesman/register");
    } catch {}
    router.replace({
      pathname: "/login",
      query: { next: "/tradesman/register" },
    });
  }, [router]);

  // Minimal fallback content for a very fast redirect
  return (
    <>
      <Head>
        <meta name="robots" content="noindex" />
        <title>Vendor login • Vetmybuilder</title>
      </Head>
      <p className="sr-only">Redirecting to vendor login…</p>
    </>
  );
}
