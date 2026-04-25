// web/pages/match/[matchId].tsx
//
// Match-formed celebration page (M1 — Full-screen celebration).
// Fetches /api/matches/:matchId and renders the other party's contact
// details with a primary WhatsApp CTA, secondary call, and back-to-matches.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import AuthedOnly from "@/components/AuthedOnly";
import { Handshake, MessageCircle, Phone as PhoneIcon, Mail } from "lucide-react";

interface MatchData {
  builderName: string;
  homeownerName: string;
  phone: string;
  email: string;
}

export default function MatchPage() {
  const router = useRouter();
  const api = useApi();
  const [match, setMatch] = useState<MatchData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const matchId = router.query.matchId as string | undefined;

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    api
      .get(`/api/matches/${matchId}`)
      .then((res) => {
        if (!cancelled) {
          setMatch(res.data.match);
          setNotFound(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMatch(null);
          setNotFound(true);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  if (notFound) {
    return (
      <AuthedOnly>
        <main
          className="fixed inset-0 overflow-y-auto flex flex-col"
          style={{
            background: "radial-gradient(1000px 600px at 50% -10%, #eef2ff, white 60%)",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
          }}
        >
          <div className="h-[env(safe-area-inset-top)]" />
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
            <div className="w-24 h-24 mb-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500">
              <Handshake size={40} />
            </div>
            <h1 className="text-[26px] font-extrabold tracking-[-0.02em] leading-[1.15] text-gray-900">
              Waiting on the builder
            </h1>
            <p className="mt-3 text-[14px] text-gray-600 max-w-xs leading-[1.5]">
              You've expressed interest. We'll notify you the moment they pick you back — then their contact details are revealed here.
            </p>
            <button
              onClick={() => router.push("/matches")}
              className="mt-8 py-3 px-6 rounded-2xl bg-white border border-gray-200 text-gray-800 font-bold text-[14px]"
            >
              Back to your matches
            </button>
          </div>
          <div className="h-[env(safe-area-inset-bottom)]" />
        </main>
      </AuthedOnly>
    );
  }

  if (!match) {
    return (
      <main
        className="fixed inset-0 bg-white flex items-center justify-center text-gray-500"
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
        }}
      >
        Loading…
      </main>
    );
  }

  const phoneDigits = (match.phone || "").replace(/[^0-9]/g, "");
  const waLink = phoneDigits ? `https://wa.me/${phoneDigits}` : null;
  const mailto = `mailto:${match.email}`;
  const tel = phoneDigits ? `tel:${phoneDigits}` : null;

  const builderInitial = (match.builderName || "?")
    .trim()
    .charAt(0)
    .toUpperCase();
  const homeownerInitial = (match.homeownerName || "?")
    .trim()
    .charAt(0)
    .toUpperCase();
  const builderFirstName = (match.builderName || "").split(" ")[0] || "them";

  return (
    <AuthedOnly>
      <main
        className="fixed inset-0 overflow-y-auto flex flex-col"
        style={{
          background:
            "radial-gradient(1000px 600px at 50% -10%, #eef2ff, white 60%)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
        }}
      >
        <div className="h-[env(safe-area-inset-top)]" />

        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
          {/* Animated heart with pulsing rings */}
          <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
            <span
              className="absolute inset-0 rounded-full bg-indigo-200/60 animate-ping"
              style={{ animationDuration: "2.2s" }}
            />
            <span
              className="absolute inset-2 rounded-full bg-indigo-300/60 animate-ping"
              style={{ animationDuration: "1.8s", animationDelay: "0.3s" }}
            />
            <span className="absolute inset-5 rounded-full bg-indigo-500" />
            <Handshake className="relative text-white" size={52} />
          </div>

          <h1 className="text-[32px] font-extrabold tracking-[-0.02em] leading-[1.1] text-gray-900">
            It's a match!
          </h1>
          <p className="mt-3 text-[15px] text-gray-600 max-w-xs leading-[1.5]">
            You and{" "}
            <span className="font-bold text-gray-900">{match.builderName}</span>{" "}
            both want to work together.
          </p>

          {/* Overlapping avatar pair */}
          <div className="relative flex items-center justify-center mt-6 mb-2 h-[76px]">
            <div
              className="w-[72px] h-[72px] rounded-full border-[3px] border-white shadow-lg flex items-center justify-center text-white font-extrabold text-[26px] -mr-3 z-10"
              style={{
                background: "linear-gradient(135deg, #a5b4fc, #6366f1)",
              }}
            >
              {homeownerInitial}
            </div>
            <div
              className="w-[72px] h-[72px] rounded-full border-[3px] border-white shadow-lg flex items-center justify-center text-white font-extrabold text-[26px] -ml-3 z-0"
              style={{
                background: "linear-gradient(135deg, #6ee7b7, #10b981)",
              }}
            >
              {builderInitial}
            </div>
          </div>

          {/* Revealed contact card */}
          <div className="mt-8 w-full max-w-sm bg-white rounded-[22px] border border-gray-100 shadow-[0_10px_40px_rgba(17,24,39,0.08)] p-5 text-left">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-gray-400">
              Contact revealed
            </div>
            {match.phone && (
              <div className="flex items-center gap-3 mt-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">
                  <PhoneIcon size={14} />
                </div>
                <div className="text-[15px] font-bold text-gray-900">
                  {match.phone}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 mt-3">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">
                <Mail size={14} />
              </div>
              <div className="text-[14px] font-semibold text-gray-700 break-all">
                {match.email}
              </div>
            </div>
          </div>

          {/* Primary + secondary CTA */}
          <div className="mt-6 w-full max-w-sm space-y-2.5">
            {waLink ? (
              <a
                href={waLink}
                aria-label={`Open WhatsApp to message ${match.builderName}`}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-indigo-600 text-white font-extrabold text-[15px] shadow-lg shadow-indigo-600/30"
              >
                <MessageCircle size={18} />
                Message {builderFirstName} now
              </a>
            ) : (
              <a
                href={mailto}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-indigo-600 text-white font-extrabold text-[15px] shadow-lg shadow-indigo-600/30"
              >
                <Mail size={18} />
                Email {builderFirstName} now
              </a>
            )}
            {tel && (
              <a
                href={tel}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-gray-200 text-gray-800 font-bold text-[14px]"
              >
                <PhoneIcon size={16} />
                Call
              </a>
            )}
            <button
              onClick={() => router.push("/matches")}
              className="w-full py-3 text-[13px] font-bold text-gray-500"
            >
              Back to your matches
            </button>
          </div>
        </div>

        <div className="h-[env(safe-area-inset-bottom)]" />
      </main>
    </AuthedOnly>
  );
}
