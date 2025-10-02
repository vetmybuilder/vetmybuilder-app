// web/components/Layout.tsx
import Link from "next/link";
import { useAuth } from "@/utils/auth";
import NotificationsBell from "@/components/NotificationsBell";
import Footer from "./Footer";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-black">
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-black/30 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/" className="font-semibold hover:opacity-90">
            Vetmybuilder
          </Link>

          <div className="flex items-center gap-4">
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
              </>
            ) : (
              <span className="text-sm text-zinc-300">Not signed in</span>
            )}
          </div>
        </div>
      </header>

      {/* Main grows to fill, with desktop container width */}
      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-6 flex-1">
        {children}
      </main>

      {/* Show footer on every page */}
      <Footer />
    </div>
  );
}
