// import { useEffect } from "react";
// import { useRouter } from "next/router";
// import Head from "next/head";

// export default function TradesmanLoginAlias() {
//   const router = useRouter();

//   useEffect(() => {
//     try {
//       // Ensure auth flow returns to vendor register after login
//       sessionStorage.setItem("vmb:returnTo", "/tradesman/profile");
//     } catch {}
//     router.replace({
//       pathname: "/login",
//       query: { next: "/tradesman/profile" },
//     });
//   }, [router]);

//   // Minimal fallback content for a very fast redirect
//   return (
//     <>
//       <Head>
//         <meta name="robots" content="noindex" />
//         <title>Vendor login • Vetmybuilder</title>
//       </Head>
//       <p className="sr-only">Redirecting to vendor login…</p>
//     </>
//   );
// }
// web/pages/tradesman/login.tsx
import { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

export default function TradesmanLoginAlias() {
  const router = useRouter();

  useEffect(() => {
    try {
      // After login, send tradesmen to their projects dashboard
      sessionStorage.setItem("vmb:returnTo", "/tradesman/projects");
    } catch {}
    router.replace({
      pathname: "/login",
      query: { next: "/tradesman/projects" },
    });
  }, [router]);

  // Minimal fallback while redirecting
  return (
    <>
      <Head>
        <meta name="robots" content="noindex" />
        <title>Tradesman login • Vetmybuilder</title>
      </Head>
      <p className="sr-only">Redirecting to tradesman login…</p>
    </>
  );
}
