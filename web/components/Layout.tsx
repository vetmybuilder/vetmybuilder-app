// web/components/Layout.tsx
import Link from "next/link";
import { useAuth, signOutUser } from "@/utils/auth";
import NotificationsBell from "@/components/NotificationsBell";
// import Footer from "./Footer"; // optional global footer

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  async function onLogout() {
    try {
      await signOutUser();
      window.location.href = "/"; // or useRouter().replace("/")
    } catch {
      alert("Failed to sign out. Please try again.");
    }
  }

  return (
    <div>
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-black/30 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
          <Link href="/" className="font-semibold hover:opacity-90">
            Vetmybuilder
          </Link>

          <div className="flex items-center gap-4">
            {/* Global Projects entry point */}
            <Link
              href={user ? "/projects" : "/login"}
              className="rounded-md px-3 py-1.5 text-sm border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/10"
            >
              Projects
            </Link>

            {user ? (
              <>
                <NotificationsBell />
                <Link
                  href="/profile"
                  className="text-sm text-indigo-300 hover:text-indigo-200 underline-offset-4 hover:underline"
                >
                  Profile
                </Link>
                <span className="text-sm text-zinc-300">
                  Signed in as{" "}
                  <span className="font-medium">{user.email || user.uid}</span>
                </span>
                <button
                  onClick={onLogout}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white border border-red-600/30 hover:bg-red-500 transition"
                >
                  Logout
                </button>
              </>
            ) : (
              <span className="text-sm text-zinc-300">Not signed in</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">{children}</main>
      {/* If you want a global footer, uncomment: */}
      {/* <Footer /> */}
    </div>
  );
}
