// web/pages/match/[matchId].tsx
//
// Match page (M1). Behaviour depends on the swipe state returned by
// /api/matches/:matchId:
//   - matched : both sides swiped right. Full celebration with revealed
//               contact details and chat/WhatsApp CTAs.
//   - pending : exactly one side has swiped. Two sub-states:
//                 a) viewer is the one who swiped first, waiting on the
//                    other party. Shows a "waiting" screen.
//                 b) viewer is the one with the outstanding decision (the
//                    other party expressed interest first). Shows an
//                    "interested in you" prompt that routes back to the
//                    relevant swipe deck so the viewer can swipe to match.
import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRole } from "@/utils/useRole";
import AuthedOnly from "@/components/AuthedOnly";
import Layout from "@/components/Layout";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import Link from "next/link";
import { ChevronLeft, Handshake, MessageCircle, MessagesSquare, Phone as PhoneIcon, Mail, Heart, ShieldCheck } from "lucide-react";

/**
 * Pick the correct cross-project matches list for the viewer. Homeowners
 * see /matches (matches across their projects); tradesmen see
 * /tradesman/matches (matches across their swipes). Used by every "Back
 * to your matches" CTA on the page so a builder never lands on the
 * homeowner-only list.
 */
function matchesPathFor(opts: {
  viewerIsBuilder?: boolean;
  role?: string;
}): string {
  if (opts.viewerIsBuilder === true) return "/tradesman/matches";
  if (opts.viewerIsBuilder === false) return "/matches";
  return opts.role === "tradesman" ? "/tradesman/matches" : "/matches";
}

type MatchStatus = "matched" | "pending";

interface MatchData {
  status: MatchStatus;
  viewerIsBuilder: boolean;
  homeownerSwiped: boolean;
  builderSwiped: boolean;
  projectId: number | string;
  builderUid: string;
  builderName: string;
  builderPhotoUrl?: string | null;
  homeownerName: string;
  phone: string;
  email: string;
}

export default function MatchPage() {
  // AuthedOnly handles the unauth -> /login redirect and renders its own
  // loading state until Firebase has restored the user. Wrapping the whole
  // page (rather than each branch individually) means the inner component
  // never mounts without a user, and we can never get stuck on a bare
  // white "Loading…" screen with no redirect path - a corner case we hit
  // when match data has been wiped on the server.
  return (
    <AuthedOnly>
      <MatchPageInner />
    </AuthedOnly>
  );
}

function MatchPageInner() {
  const router = useRouter();
  const api = useApi();
  const { user, loading: authLoading } = useAuth();
  const { role } = useRole();
  const [match, setMatch] = useState<MatchData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const matchId = router.query.matchId as string | undefined;
  // chatMatchId is the swipe_interest.id for the /chat route. Falls back to
  // the path param when not explicitly passed (e.g. from fireMatchFormed).
  const chatMatchId = (router.query.chatMatchId as string | undefined) ?? matchId;

  useEffect(() => {
    if (!matchId) return;
    if (authLoading) return;
    // AuthedOnly guarantees `user` is truthy by the time this inner
    // component mounts, but keep the explicit check so the api interceptor
    // never fires without a fresh Bearer token (e.g. mid-token-refresh).
    if (!user) return;

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
  }, [matchId, authLoading, user]);

  if (notFound) {
    return (
      <PendingShell onBack={() => router.back()}>
        <div className="w-24 h-24 mb-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
          <Handshake size={40} />
        </div>
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em] leading-[1.15] text-gray-900">
          Match not found
        </h1>
        <p className="mt-3 text-[14px] text-gray-600 max-w-xs leading-[1.5]">
          This match isn't available anymore.
        </p>
        <button
          onClick={() => router.push(matchesPathFor({ role }))}
          className="mt-8 py-3 px-6 rounded-2xl bg-white border border-gray-200 text-gray-800 font-bold text-[14px]"
        >
          Back to your matches
        </button>
      </PendingShell>
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

  if (match.status === "pending") {
    return <PendingState match={match} router={router} />;
  }

  return (
    <MatchedState match={match} chatMatchId={chatMatchId} router={router} />
  );
}

function PendingState({
  match,
  router,
}: {
  match: MatchData;
  router: ReturnType<typeof useRouter>;
}) {
  const otherFirstName = match.viewerIsBuilder
    ? match.homeownerName.split(" ")[0] || "the homeowner"
    : match.builderName.split(" ")[0] || "the builder";
  const otherLabel = match.viewerIsBuilder ? "homeowner" : "builder";

  const viewerSwiped = match.viewerIsBuilder
    ? match.builderSwiped
    : match.homeownerSwiped;

  if (viewerSwiped) {
    // Waiting on the other party to swipe back.
    return (
      <PendingShell onBack={() => router.back()}>
        <div className="w-24 h-24 mb-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500">
          <Handshake size={40} />
        </div>
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em] leading-[1.15] text-gray-900">
          Waiting on the {otherLabel}
        </h1>
        <p className="mt-3 text-[14px] text-gray-600 max-w-xs leading-[1.5]">
          You've expressed interest. We'll notify you the moment{" "}
          {match.viewerIsBuilder ? "they" : otherFirstName} pick
          {match.viewerIsBuilder ? "s" : "s"} you back - then{" "}
          {match.viewerIsBuilder ? "their" : "their"} contact details are
          revealed here.
        </p>
        <button
          onClick={() =>
            router.push(
              matchesPathFor({ viewerIsBuilder: match.viewerIsBuilder }),
            )
          }
          className="mt-8 py-3 px-6 rounded-2xl bg-white border border-gray-200 text-gray-800 font-bold text-[14px]"
        >
          Back to your matches
        </button>
      </PendingShell>
    );
  }

  // The OTHER side swiped first; the viewer hasn't decided yet. Prompt them
  // back to the appropriate swipe deck so they can complete the bilateral
  // swipe (or pass).
  const ctaHref = match.viewerIsBuilder
    ? `/tradesman/jobs?focus=${match.projectId}`
    : `/projects/${match.projectId}`;
  const ctaLabel = match.viewerIsBuilder
    ? "Open the job"
    : "Open your project";

  return (
    <PendingShell onBack={() => router.back()}>
      <div className="relative w-28 h-28 mb-6 flex items-center justify-center">
        <span
          className="absolute inset-0 rounded-full bg-rose-200/70 animate-ping"
          style={{ animationDuration: "2.2s" }}
        />
        <span className="absolute inset-3 rounded-full bg-rose-500" />
        <Heart className="relative text-white" size={44} fill="white" />
      </div>
      <h1 className="text-[28px] font-extrabold tracking-[-0.02em] leading-[1.1] text-gray-900">
        {match.viewerIsBuilder
          ? `${otherFirstName} likes your profile`
          : `${match.builderName} is interested`}
      </h1>
      <p className="mt-3 text-[14px] text-gray-600 max-w-xs leading-[1.5]">
        {match.viewerIsBuilder
          ? "They've swiped right on your profile. Take a look at the job and swipe back to match - you'll then see their contact details."
          : "They've swiped right on your project. Take a look at their profile and swipe back to match - you'll then see their contact details."}
      </p>
      {!match.viewerIsBuilder && match.builderPhotoUrl && (
        <img
          src={match.builderPhotoUrl}
          alt={match.builderName}
          className="mt-6 w-[72px] h-[72px] rounded-full border-[3px] border-white shadow-lg object-cover"
        />
      )}
      <div className="mt-8 w-full max-w-sm space-y-2.5">
        <Link
          href={ctaHref}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-rose-500 text-white font-extrabold text-[15px] shadow-lg shadow-rose-500/30"
        >
          <Heart size={18} fill="white" />
          {ctaLabel}
        </Link>
        <button
          onClick={() =>
            router.push(
              matchesPathFor({ viewerIsBuilder: match.viewerIsBuilder }),
            )
          }
          className="w-full py-3 text-[13px] font-bold text-gray-500"
        >
          Back to your matches
        </button>
      </div>
    </PendingShell>
  );
}

function MatchedState({
  match,
  chatMatchId,
  router,
}: {
  match: MatchData;
  chatMatchId: string | undefined;
  router: ReturnType<typeof useRouter>;
}) {
  const phoneDigits = (match.phone || "").replace(/[^0-9]/g, "");
  const waLink = phoneDigits ? `https://wa.me/${phoneDigits}` : null;
  const mailto = `mailto:${match.email}`;
  const tel = phoneDigits ? `tel:${phoneDigits}` : null;

  // Resolve "you" vs "them" from the viewer's perspective. The other-party
  // labels feed every CTA and the heading so the page reads naturally
  // regardless of which side opened it.
  const youName = match.viewerIsBuilder
    ? match.builderName
    : match.homeownerName;
  const otherName = match.viewerIsBuilder
    ? match.homeownerName
    : match.builderName;
  const otherFirstName = (otherName || "").split(" ")[0] || "them";
  const youInitial = (youName || "?").trim().charAt(0).toUpperCase();
  const otherInitial = (otherName || "?").trim().charAt(0).toUpperCase();

  // Avatar pair: the builder's profile photo represents the builder side
  // regardless of which side that is in the layout. Homeowners have no
  // profile photo in the data model, so the homeowner side is always
  // initials.
  const youIsBuilder = match.viewerIsBuilder;
  const otherIsBuilder = !match.viewerIsBuilder;
  const youPhotoUrl = youIsBuilder ? match.builderPhotoUrl || null : null;
  const otherPhotoUrl = otherIsBuilder ? match.builderPhotoUrl || null : null;

  // Brand palette: trade viewer gets emerald accents, homeowner gets
  // indigo. Keeps the match screen on-brand for whichever side is
  // looking at it (the screen is shared between both roles).
  const isTrade = !!match.viewerIsBuilder;
  const accentText = isTrade ? "text-emerald-600" : "text-indigo-600";
  const accentSolid = isTrade ? "bg-emerald-500" : "bg-indigo-500";
  const accentRing1 = isTrade ? "bg-emerald-200/60" : "bg-indigo-200/60";
  const accentRing2 = isTrade ? "bg-emerald-300/60" : "bg-indigo-300/60";
  const chatGradient = isTrade
    ? "linear-gradient(135deg,#10b981,#059669)"
    : "linear-gradient(135deg,#6366f1,#4f46e5)";
  const chatShadow = isTrade
    ? "shadow-emerald-500/25"
    : "shadow-indigo-500/25";
  const youGradient = isTrade
    ? "linear-gradient(135deg, #6ee7b7, #10b981)"
    : "linear-gradient(135deg, #a5b4fc, #6366f1)";
  const otherGradient = isTrade
    ? "linear-gradient(135deg, #a5b4fc, #6366f1)"
    : "linear-gradient(135deg, #6ee7b7, #10b981)";

  return (
    <>
      <Head>
        {/* Mobile bg is plain white (no cream watermark); desktop keeps
            the cream brand backdrop. */}
        <style>{`@media (min-width: 768px) { body { background: #fef6e9 !important; } }`}</style>
      </Head>

      {/* MOBILE — bare-route, full-bleed white shell with a circular
          chevron back button. No SiteHeader chrome to keep the focus on
          the celebratory hero card. */}
      <main
        className="md:hidden fixed inset-0 bg-white overflow-y-auto flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        data-testid="match-page-mobile"
      >
        <div style={{ height: "env(safe-area-inset-top)" }} />
        <div className="px-4 pt-2 pb-3">
          <button
            type="button"
            onClick={() =>
              router.push(
                matchesPathFor({ viewerIsBuilder: match.viewerIsBuilder }),
              )
            }
            data-testid="match-back"
            aria-label="Back to your matches"
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-700"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 px-5 pb-8">
          <MatchHero
            isTrade={isTrade}
            otherName={otherName}
            youName={youName}
            youInitial={youInitial}
            youPhotoUrl={youPhotoUrl}
            otherInitial={otherInitial}
            otherPhotoUrl={otherPhotoUrl}
            youGradient={youGradient}
            otherGradient={otherGradient}
            accentText={accentText}
            accentSolid={accentSolid}
            accentRing1={accentRing1}
            accentRing2={accentRing2}
            phone={!match.viewerIsBuilder ? match.phone : null}
            email={!match.viewerIsBuilder ? match.email : null}
            cardClassName="bg-white border border-gray-100 rounded-3xl shadow-sm p-6 text-center"
          />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <MatchActions
              chatMatchId={chatMatchId ?? null}
              waLink={waLink}
              mailto={mailto}
              tel={tel}
              otherName={otherName}
              chatGradient={chatGradient}
              chatShadow={chatShadow}
            />
          </div>
        </div>
      </main>

      {/* DESKTOP — original cream-backdrop layout with SiteHeader chrome. */}
      <div className="hidden md:block">
      <Layout>
        <div className="bg-[#fef6e9] min-h-screen -mt-14 pt-14 pb-12 relative overflow-hidden">
          <BrandWatermarkScatter />

          <div className="relative z-10 mx-auto max-w-5xl px-5 sm:px-6 pt-6">
            <button
              type="button"
              onClick={() =>
                router.push(
                  matchesPathFor({ viewerIsBuilder: match.viewerIsBuilder }),
                )
              }
              data-testid="match-back-desktop"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors mb-5"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to your matches
            </button>

            <div className="bg-white border border-amber-100 rounded-3xl shadow-sm p-6 sm:p-8 text-center">
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-5 flex items-center justify-center">
                <span
                  className={`absolute inset-0 rounded-full ${accentRing1} animate-ping`}
                  style={{ animationDuration: "2.2s" }}
                />
                <span
                  className={`absolute inset-2 rounded-full ${accentRing2} animate-ping`}
                  style={{ animationDuration: "1.8s", animationDelay: "0.3s" }}
                />
                <span className={`absolute inset-4 rounded-full ${accentSolid}`} />
                <Handshake className="relative text-white" size={36} />
              </div>

              <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-700 mb-1">
                Hooked up
              </div>
              <h1
                className="text-[32px] sm:text-[40px] font-black tracking-[-0.02em] text-slate-900 leading-[1.0]"
                style={{ fontFamily: "'Sora', sans-serif" }}
              >
                It's a{" "}
                <span
                  className={accentText}
                  style={{ fontFamily: "'Caveat', cursive", fontSize: "118%" }}
                >
                  match!
                </span>
              </h1>
              <p className="mt-3 text-[14px] sm:text-[14.5px] text-slate-600 max-w-md mx-auto leading-snug">
                You and{" "}
                <span className="font-extrabold text-slate-900">{otherName}</span>{" "}
                both want to work together.
              </p>

              <div className="mt-5 flex items-center justify-center gap-3 sm:gap-4">
                <MatchAvatar
                  photoUrl={youPhotoUrl}
                  initial={youInitial}
                  alt={youName}
                  gradient={youGradient}
                />
                <Handshake className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
                <MatchAvatar
                  photoUrl={otherPhotoUrl}
                  initial={otherInitial}
                  alt={otherName}
                  gradient={otherGradient}
                />
              </div>

              {!match.viewerIsBuilder && (match.phone || match.email) && (
                <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-2xl bg-amber-50/60 border border-amber-100 px-4 sm:px-5 py-2.5">
                  <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-amber-700">
                    Contact revealed
                  </span>
                  {match.phone && (
                    <span className="text-[13.5px] font-bold text-slate-900 inline-flex items-center gap-1.5">
                      <PhoneIcon className="w-3.5 h-3.5 text-amber-600" />
                      {match.phone}
                    </span>
                  )}
                  {match.phone && match.email && (
                    <span className="hidden sm:inline w-px h-4 bg-amber-200" aria-hidden />
                  )}
                  {match.email && (
                    <span className="text-[13.5px] font-bold text-slate-900 inline-flex items-center gap-1.5 break-all">
                      <Mail className="w-3.5 h-3.5 text-indigo-600" />
                      {match.email}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {chatMatchId && (
                <Link
                  href={`/chat/${chatMatchId}`}
                  aria-label={`Open in-app chat with ${otherName}`}
                  className={`rounded-3xl p-4 sm:p-5 text-left text-white shadow-lg ${chatShadow} hover:shadow-xl transition-all`}
                  style={{ background: chatGradient }}
                >
                  <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mb-3">
                    <MessagesSquare className="w-5 h-5 text-white" />
                  </span>
                  <div
                    className="text-[15px] sm:text-[16px] font-extrabold tracking-tight"
                    style={{ fontFamily: "'Sora', sans-serif" }}
                  >
                    Chat
                  </div>
                  <div className="mt-0.5 text-[11px] sm:text-[11.5px] text-white/80 font-bold inline-flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Moderated
                  </div>
                </Link>
              )}

              {waLink && (
                <a
                  href={waLink}
                  aria-label={`Open WhatsApp to message ${otherName}`}
                  className="rounded-3xl p-4 sm:p-5 text-left bg-white border border-amber-100 hover:border-emerald-200 transition-colors"
                >
                  <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
                    <MessageCircle className="w-5 h-5 text-emerald-600" />
                  </span>
                  <div
                    className="text-[15px] sm:text-[16px] font-extrabold text-slate-900 tracking-tight"
                    style={{ fontFamily: "'Sora', sans-serif" }}
                  >
                    WhatsApp
                  </div>
                  <div className="mt-0.5 text-[11px] sm:text-[11.5px] text-slate-500 font-semibold">
                    Open in WhatsApp
                  </div>
                </a>
              )}

              <a
                href={mailto}
                aria-label={`Email ${otherName}`}
                className="rounded-3xl p-4 sm:p-5 text-left bg-white border border-amber-100 hover:border-indigo-200 transition-colors"
              >
                <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-indigo-50 flex items-center justify-center mb-3">
                  <Mail className="w-5 h-5 text-indigo-600" />
                </span>
                <div
                  className="text-[15px] sm:text-[16px] font-extrabold text-slate-900 tracking-tight"
                  style={{ fontFamily: "'Sora', sans-serif" }}
                >
                  Email
                </div>
                <div className="mt-0.5 text-[11px] sm:text-[11.5px] text-slate-500 font-semibold">
                  Open mail client
                </div>
              </a>

              {tel && (
                <a
                  href={tel}
                  aria-label={`Call ${otherName}`}
                  className="rounded-3xl p-4 sm:p-5 text-left bg-white border border-amber-100 hover:border-amber-200 transition-colors"
                >
                  <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-amber-50 flex items-center justify-center mb-3">
                    <PhoneIcon className="w-5 h-5 text-amber-600" />
                  </span>
                  <div
                    className="text-[15px] sm:text-[16px] font-extrabold text-slate-900 tracking-tight"
                    style={{ fontFamily: "'Sora', sans-serif" }}
                  >
                    Call
                  </div>
                  <div className="mt-0.5 text-[11px] sm:text-[11.5px] text-slate-500 font-semibold">
                    Tap to dial
                  </div>
                </a>
              )}
            </div>
          </div>
        </div>
      </Layout>
      </div>
    </>
  );
}

/**
 * Single avatar tile in the overlapping match-pair UI. Shows the photo
 * when present, falls back to initials with the supplied gradient.
 * Used for both "you" and the other party so a fix to the photo/initial
 * logic only needs to happen in one place.
 */
/**
 * Mobile-only hero card. Mirrors the desktop centred-card design but
 * tunes the spacing for a phone screen and reads brand tone from props.
 */
function MatchHero({
  isTrade,
  otherName,
  youName,
  youInitial,
  youPhotoUrl,
  otherInitial,
  otherPhotoUrl,
  youGradient,
  otherGradient,
  accentText,
  accentSolid,
  accentRing1,
  accentRing2,
  phone,
  email,
  cardClassName,
}: {
  isTrade: boolean;
  otherName: string;
  youName: string;
  youInitial: string;
  youPhotoUrl: string | null;
  otherInitial: string;
  otherPhotoUrl: string | null;
  youGradient: string;
  otherGradient: string;
  accentText: string;
  accentSolid: string;
  accentRing1: string;
  accentRing2: string;
  phone: string | null;
  email: string | null;
  cardClassName: string;
}) {
  void isTrade;
  return (
    <div className={cardClassName}>
      <div className="relative w-20 h-20 mx-auto mb-5 flex items-center justify-center">
        <span
          className={`absolute inset-0 rounded-full ${accentRing1} animate-ping`}
          style={{ animationDuration: "2.2s" }}
        />
        <span
          className={`absolute inset-2 rounded-full ${accentRing2} animate-ping`}
          style={{ animationDuration: "1.8s", animationDelay: "0.3s" }}
        />
        <span className={`absolute inset-4 rounded-full ${accentSolid}`} />
        <Handshake className="relative text-white" size={32} />
      </div>
      <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-700 mb-1">
        Hooked up
      </div>
      <h1
        className="text-[32px] font-black tracking-[-0.02em] text-slate-900 leading-[1.0]"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        It's a{" "}
        <span
          className={accentText}
          style={{ fontFamily: "'Caveat', cursive", fontSize: "118%" }}
        >
          match!
        </span>
      </h1>
      <p className="mt-3 text-[14px] text-slate-600 max-w-md mx-auto leading-snug">
        You and{" "}
        <span className="font-extrabold text-slate-900">{otherName}</span>{" "}
        both want to work together.
      </p>
      <div className="mt-5 flex items-center justify-center gap-3">
        <MatchAvatar
          photoUrl={youPhotoUrl}
          initial={youInitial}
          alt={youName}
          gradient={youGradient}
        />
        <Handshake className="w-4 h-4 text-amber-500" />
        <MatchAvatar
          photoUrl={otherPhotoUrl}
          initial={otherInitial}
          alt={otherName}
          gradient={otherGradient}
        />
      </div>
      {(phone || email) && (
        <div className="mt-5 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-2xl bg-amber-50/60 border border-amber-100 px-4 py-2.5">
          <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-amber-700">
            Contact revealed
          </span>
          {phone && (
            <span className="text-[13.5px] font-bold text-slate-900 inline-flex items-center gap-1.5">
              <PhoneIcon className="w-3.5 h-3.5 text-amber-600" />
              {phone}
            </span>
          )}
          {email && (
            <span className="text-[13.5px] font-bold text-slate-900 inline-flex items-center gap-1.5 break-all">
              <Mail className="w-3.5 h-3.5 text-indigo-600" />
              {email}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Mobile action grid (Chat / WhatsApp / Email / Call). */
function MatchActions({
  chatMatchId,
  waLink,
  mailto,
  tel,
  otherName,
  chatGradient,
  chatShadow,
}: {
  chatMatchId: string | number | null;
  waLink: string | null;
  mailto: string;
  tel: string | null;
  otherName: string;
  chatGradient: string;
  chatShadow: string;
}) {
  return (
    <>
      {chatMatchId && (
        <Link
          href={`/chat/${chatMatchId}`}
          aria-label={`Open in-app chat with ${otherName}`}
          className={`rounded-3xl p-4 text-left text-white shadow-lg ${chatShadow} hover:shadow-xl transition-all`}
          style={{ background: chatGradient }}
        >
          <span className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mb-3">
            <MessagesSquare className="w-5 h-5 text-white" />
          </span>
          <div
            className="text-[15px] font-extrabold tracking-tight"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            Chat
          </div>
          <div className="mt-0.5 text-[11px] text-white/80 font-bold inline-flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            Moderated
          </div>
        </Link>
      )}
      {waLink && (
        <a
          href={waLink}
          aria-label={`Open WhatsApp to message ${otherName}`}
          className="rounded-3xl p-4 text-left bg-white border border-gray-100 hover:border-emerald-200 transition-colors"
        >
          <span className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
            <MessageCircle className="w-5 h-5 text-emerald-600" />
          </span>
          <div
            className="text-[15px] font-extrabold text-slate-900 tracking-tight"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            WhatsApp
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 font-semibold">
            Open in WhatsApp
          </div>
        </a>
      )}
      <a
        href={mailto}
        aria-label={`Email ${otherName}`}
        className="rounded-3xl p-4 text-left bg-white border border-gray-100 hover:border-indigo-200 transition-colors"
      >
        <span className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center mb-3">
          <Mail className="w-5 h-5 text-indigo-600" />
        </span>
        <div
          className="text-[15px] font-extrabold text-slate-900 tracking-tight"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          Email
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500 font-semibold">
          Open mail client
        </div>
      </a>
      {tel && (
        <a
          href={tel}
          aria-label={`Call ${otherName}`}
          className="rounded-3xl p-4 text-left bg-white border border-gray-100 hover:border-amber-200 transition-colors"
        >
          <span className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center mb-3">
            <PhoneIcon className="w-5 h-5 text-amber-600" />
          </span>
          <div
            className="text-[15px] font-extrabold text-slate-900 tracking-tight"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            Call
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 font-semibold">
            Tap to dial
          </div>
        </a>
      )}
    </>
  );
}

function MatchAvatar({
  photoUrl,
  initial,
  alt,
  gradient,
  className,
}: {
  photoUrl: string | null;
  initial: string;
  alt: string;
  gradient: string;
  className?: string;
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={alt}
        className={`w-[72px] h-[72px] rounded-full border-[3px] border-white shadow-lg object-cover ${className || ""}`}
      />
    );
  }
  return (
    <div
      className={`w-[72px] h-[72px] rounded-full border-[3px] border-white shadow-lg flex items-center justify-center text-white font-extrabold text-[26px] ${className || ""}`}
      style={{ background: gradient }}
    >
      {initial}
    </div>
  );
}

function PendingShell({
  onBack,
  children,
}: {
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
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
      <BackChevron onClick={onBack} />
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
        {children}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </main>
  );
}

/**
 * Floating top-left back chevron used on every render branch of /match/[matchId].
 * Matches the affordance on other bare-route pages (close, builder profile,
 * tradesman profile). Sits absolutely so the centred celebration content stays
 * visually balanced. router.back() is fine here - when there's no history (deep
 * link / push notification) the user still has the explicit "Back to your
 * matches" CTA below.
 */
function BackChevron({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={onClick}
      data-testid="match-back"
      className="absolute left-3.5 w-10 h-10 rounded-full flex items-center justify-center text-gray-700 z-10"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 8px)",
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 2px 8px rgba(15,23,42,0.08)",
      }}
    >
      <ChevronLeft className="w-5 h-5" />
    </button>
  );
}
