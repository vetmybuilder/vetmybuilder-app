import Head from "next/head";
import { useState } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import Link from "next/link";

const EMOJI_SCALE = [
  { value: 1, emoji: "\uD83D\uDE1E", label: "Poor" },
  { value: 2, emoji: "\uD83D\uDE15", label: "Not great" },
  { value: 3, emoji: "\uD83D\uDE10", label: "OK" },
  { value: 4, emoji: "\uD83D\uDE0A", label: "Good" },
  { value: 5, emoji: "\uD83E\uDD29", label: "Amazing" },
];

const USER_TYPES = [
  { value: "posted_job", label: "I posted a job" },
  { value: "recommended", label: "I recommended a tradesperson" },
  { value: "browsing", label: "Just browsing" },
  { value: "tradesperson", label: "I'm a tradesperson" },
];

const FEATURES = [
  { value: "posting", label: "Posting a job" },
  { value: "sharing", label: "Sharing with friends" },
  { value: "recommendations", label: "Viewing recommendations" },
  { value: "comparing", label: "Comparing tradespeople" },
  { value: "hiring", label: "Hiring a tradesperson" },
  { value: "voting", label: "Voting on recommendations" },
];

const RECOMMEND_OPTIONS = [
  { value: "yes", label: "Yes", color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  { value: "maybe", label: "Maybe", color: "bg-amber-50 border-amber-200 text-amber-700" },
  { value: "no", label: "No", color: "bg-red-50 border-red-200 text-red-700" },
];

export default function FeedbackPage() {
  const api = useApi();
  const { user } = useAuth();

  const [userTypes, setUserTypes] = useState<string[]>([]);
  const [featuresUsed, setFeaturesUsed] = useState<string[]>([]);
  const [rating, setRating] = useState(0);
  const [easeOfUse, setEaseOfUse] = useState(0);
  const [positives, setPositives] = useState("");
  const [improvements, setImprovements] = useState("");
  const [recommend, setRecommend] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleUserType(value: string) {
    setUserTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function toggleFeature(value: string) {
    setFeaturesUsed((prev) =>
      prev.includes(value) ? prev.filter((f) => f !== value) : [...prev, value]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (userTypes.length === 0) {
      setError("Please tell us what you're using VetMyBuilder for");
      return;
    }
    if (rating === 0) {
      setError("Please rate your experience");
      return;
    }
    if (!recommend) {
      setError("Please tell us if you'd recommend VetMyBuilder");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/feedback", {
        userType: userTypes.length > 0 ? userTypes.join(",") : undefined,
        featuresUsed: featuresUsed.length > 0 ? featuresUsed : undefined,
        rating,
        easeOfUse: easeOfUse || undefined,
        positives: positives.trim() || undefined,
        improvements: improvements.trim() || undefined,
        recommend: recommend || undefined,
      });
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Give Feedback - VetMyBuilder</title>
      </Head>

      <div className="relative min-h-screen overflow-hidden -mt-14">
        <div className="relative z-10 mx-auto max-w-xl px-4 sm:px-6 pt-20 pb-16">

          {submitted ? (
            <div className="bg-white rounded-3xl shadow-xl p-8 sm:p-12 text-center">
              <div className="text-6xl mb-4">{"\uD83D\uDE4F"}</div>
              <h1 className="text-2xl font-black text-zinc-900 mb-2">Thank you!</h1>
              <p className="text-zinc-500 mb-6">Your feedback helps us build a better platform for everyone.</p>
              <Link
                href={user ? "/projects" : "/"}
                className="inline-flex items-center justify-center rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white hover:bg-red-600 transition-colors"
              >
                Back to {user ? "my jobs" : "home"}
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
              <div className="px-6 py-6 sm:px-10 sm:py-8 border-b border-zinc-100">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900">
                  How are we doing?
                </h1>
                <p className="mt-1 text-sm text-zinc-500">
                  Your feedback helps us improve VetMyBuilder. It only takes a minute.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="px-6 py-6 sm:px-10 sm:py-8 space-y-8">

                {/* 1. User type (multi-select) */}
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-3">
                    What are you using VetMyBuilder for? <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {USER_TYPES.map((opt) => {
                      const isOn = userTypes.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => toggleUserType(opt.value)}
                          className={`py-2 px-3.5 rounded-full border-2 text-sm font-medium transition-all ${
                            isOn
                              ? "border-red-500 bg-red-50 text-red-700"
                              : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                          }`}
                        >
                          {isOn && <span className="mr-1">&#10003;</span>}
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Features used */}
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-3">
                    Which features have you used?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {FEATURES.map((feat) => {
                      const isOn = featuresUsed.includes(feat.value);
                      return (
                        <button
                          key={feat.value}
                          type="button"
                          onClick={() => toggleFeature(feat.value)}
                          className={`py-2 px-3.5 rounded-full border-2 text-sm font-medium transition-all ${
                            isOn
                              ? "border-red-500 bg-red-50 text-red-700"
                              : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                          }`}
                        >
                          {isOn && <span className="mr-1">&#10003;</span>}
                          {feat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Experience rating */}
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-3">
                    How would you rate your experience? <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2 sm:gap-4">
                    {EMOJI_SCALE.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setRating(item.value)}
                        className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all flex-1 ${
                          rating === item.value
                            ? "border-red-500 bg-red-50 scale-110"
                            : "border-zinc-200 hover:border-zinc-300"
                        }`}
                      >
                        <span className="text-2xl sm:text-3xl">{item.emoji}</span>
                        <span className="text-[10px] sm:text-xs text-zinc-500 font-medium">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Ease of use */}
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-3">
                    How easy was it to use?
                  </label>
                  <div className="flex gap-2 sm:gap-4">
                    {EMOJI_SCALE.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setEaseOfUse(item.value)}
                        className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all flex-1 ${
                          easeOfUse === item.value
                            ? "border-red-500 bg-red-50 scale-110"
                            : "border-zinc-200 hover:border-zinc-300"
                        }`}
                      >
                        <span className="text-2xl sm:text-3xl">{item.emoji}</span>
                        <span className="text-[10px] sm:text-xs text-zinc-500 font-medium">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5. What's working well */}
                <div>
                  <label htmlFor="positives" className="block text-sm font-semibold text-zinc-700 mb-2">
                    What's working well?
                  </label>
                  <textarea
                    id="positives"
                    rows={3}
                    value={positives}
                    onChange={(e) => setPositives(e.target.value)}
                    placeholder="Tell us what you like about VetMyBuilder..."
                    className="input resize-none"
                  />
                </div>

                {/* 6. What would you change */}
                <div>
                  <label htmlFor="improvements" className="block text-sm font-semibold text-zinc-700 mb-2">
                    What's one thing you'd change?
                  </label>
                  <textarea
                    id="improvements"
                    rows={3}
                    value={improvements}
                    onChange={(e) => setImprovements(e.target.value)}
                    placeholder="If you could change one thing, what would it be?"
                    className="input resize-none"
                  />
                </div>

                {/* 7. Recommend */}
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-3">
                    Would you recommend VetMyBuilder to a friend? <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-3">
                    {RECOMMEND_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRecommend(opt.value)}
                        className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                          recommend === opt.value
                            ? `${opt.color} border-current scale-105`
                            : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-600 font-medium">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting || userTypes.length === 0 || rating === 0 || !recommend}
                  className="w-full rounded-full bg-red-500 py-3.5 text-base font-bold text-white shadow-lg shadow-red-500/25 hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Sending..." : "Submit feedback"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
