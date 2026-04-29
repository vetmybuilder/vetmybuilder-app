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
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRole } from "@/utils/useRole";
import AuthedOnly from "@/components/AuthedOnly";
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
      <BackChevron onClick={() => router.back()} />

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
          <span className="font-bold text-gray-900">{otherName}</span>{" "}
          both want to work together.
        </p>

        {/* Overlapping avatar pair: viewer (you) on the left, the other
            party on the right. Both sides share the same render path -
            photo when present, initials otherwise - so the builder always
            sees their profile photo regardless of whether they're viewer
            or other. */}
        <div className="relative flex items-center justify-center mt-6 mb-2 h-[76px]">
          <MatchAvatar
            photoUrl={youPhotoUrl}
            initial={youInitial}
            alt={youName}
            gradient="linear-gradient(135deg, #a5b4fc, #6366f1)"
            className="-mr-3 z-10"
          />
          <MatchAvatar
            photoUrl={otherPhotoUrl}
            initial={otherInitial}
            alt={otherName}
            gradient="linear-gradient(135deg, #6ee7b7, #10b981)"
            className="-ml-3 z-0"
          />
        </div>

        {/* Revealed contact card. Only homeowners see this - it's where
            the builder's phone and email get surfaced once the match
            forms. Builders don't need the equivalent for the homeowner:
            homeowners have no phone in the schema, and exposing the
            email upfront is unnecessary when chat / email CTAs do the job. */}
        {!match.viewerIsBuilder && (
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
            {match.email && (
              <div className="flex items-center gap-3 mt-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">
                  <Mail size={14} />
                </div>
                <div className="text-[14px] font-semibold text-gray-700 break-all">
                  {match.email}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Communication channels, ordered by preference: in-app chat first
            (safest - moderated), then WhatsApp / email / call as outbound
            options. Channels that need a phone number are hidden when the
            other party hasn't shared one (homeowners currently never do). */}
        <div className="mt-6 w-full max-w-sm space-y-2.5">
          {chatMatchId && (
            <div>
              <Link
                href={`/chat/${chatMatchId}`}
                aria-label={`Open in-app chat with ${otherName}`}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-600 text-white font-extrabold text-[15px] shadow-lg shadow-emerald-600/30"
              >
                <MessagesSquare size={18} />
                Chat
              </Link>
              <p className="mt-1.5 text-[11px] text-gray-500 text-center flex items-center justify-center gap-1.5">
                <ShieldCheck size={12} className="text-emerald-600" />
                Quickest and safest - messages are moderated.
              </p>
            </div>
          )}

          {waLink && (
            <a
              href={waLink}
              aria-label={`Open WhatsApp to message ${otherName}`}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-extrabold text-[14px] shadow-md"
              style={{ background: "#25D366" }}
            >
              <MessageCircle size={18} />
              WhatsApp
            </a>
          )}

          <a
            href={mailto}
            aria-label={`Email ${otherName}`}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-indigo-600 text-white font-extrabold text-[14px] shadow-md"
          >
            <Mail size={16} />
            Email
          </a>

          {tel && (
            <a
              href={tel}
              aria-label={`Call ${otherName}`}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-gray-200 text-gray-800 font-bold text-[14px]"
            >
              <PhoneIcon size={16} />
              Call
            </a>
          )}

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
      </div>

      <div className="h-[env(safe-area-inset-bottom)]" />
    </main>
  );
}

/**
 * Single avatar tile in the overlapping match-pair UI. Shows the photo
 * when present, falls back to initials with the supplied gradient.
 * Used for both "you" and the other party so a fix to the photo/initial
 * logic only needs to happen in one place.
 */
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
