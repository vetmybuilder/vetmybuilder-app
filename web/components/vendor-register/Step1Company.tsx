import LocationField from "@/components/forms/LocationField";
import SocialRow from "./SocialRow";
import {
  normalizeFacebook,
  normalizeInstagram,
  normalizeLinkedIn,
  normalizeTikTok,
  normalizeX,
  normalizeYouTube,
} from "@/utils/socialLinks";

export type Step1Form = {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  serviceAreas: string[];
  website: string;
  socials: {
    instagram: string;
    tiktok: string;
    facebook: string;
    x: string;
    youtube: string;
    linkedin: string;
  };
};

type Props = {
  form: Step1Form;
  set<K extends keyof Step1Form>(k: K, v: Step1Form[K]): void;
  addServiceArea: (raw: string) => void;
  removeServiceArea: (code: string) => void;
  areaQuery: string;
  setAreaQuery: (s: string) => void;
  websiteInput: string;
  setWebsiteInput: (s: string) => void;
  commitWebsite: () => void;
  onWebsiteKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  clearWebsite: () => void;
  canProceed: boolean;
  onNext: (e: React.FormEvent) => void;
  userIsAuthed: boolean;
  nextQuery: string;
  emailError?: string | null;

  // NEW: only used by the edit-profile page
  disableCompanyName?: boolean;
  disableBusinessEmail?: boolean;
};

export default function Step1Company({
  form,
  set,
  addServiceArea,
  removeServiceArea,
  areaQuery,
  setAreaQuery,
  websiteInput,
  setWebsiteInput,
  commitWebsite,
  onWebsiteKey,
  clearWebsite,
  canProceed,
  onNext,
  userIsAuthed,
  nextQuery,
  emailError,
  disableCompanyName,
  disableBusinessEmail,
}: Props) {
  return (
    <form className="card grid gap-3" onSubmit={onNext} data-testid="step-1">
      <label
        className="text-sm"
        htmlFor="companyName"
        data-testid="label-company-name"
      >
        Company name *
      </label>
      <input
        id="companyName"
        className="input"
        value={form.companyName}
        onChange={(e) => set("companyName", e.target.value)}
        placeholder="Company Ltd"
        data-testid="input-company-name"
        disabled={disableCompanyName}
      />

      <label
        className="text-sm"
        htmlFor="contactName"
        data-testid="label-contact-name"
      >
        Contact name *
      </label>
      <input
        id="contactName"
        className="input"
        value={form.contactName}
        onChange={(e) => set("contactName", e.target.value)}
        placeholder="Your name"
        data-testid="input-contact-name"
      />

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm" htmlFor="phone" data-testid="label-phone">
            Phone (optional)
          </label>
          <input
            id="phone"
            className="input"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="020..."
            data-testid="input-phone"
          />
          <p className="mt-1 text-xs text-slate-500">
            We ask for this so homeowners can contact you.
          </p>
        </div>
        <div>
          <label className="text-sm" htmlFor="email" data-testid="label-email">
            Business email *
          </label>
          <input
            id="email"
            className={`input ${
              emailError
                ? "border-red-500 ring-1 ring-red-500 focus:border-red-500 focus:ring-red-500"
                : ""
            }`}
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
            data-testid="input-email"
            aria-invalid={!!emailError}
            aria-describedby={emailError ? "email-error" : undefined}
            disabled={disableBusinessEmail}
          />
          {emailError && (
            <p
              id="email-error"
              className="mt-1 text-sm text-red-600"
              role="alert"
            >
              {emailError}
            </p>
          )}
        </div>
      </div>

      <label className="text-sm" data-testid="label-areas">
        Service areas * (postcode sectors)
      </label>
      <div data-testid="input-areas">
        <LocationField
          label=""
          reasonText=""
          placeholder="Type a postcode or place… e.g., E4, N17, Chingford"
          value={areaQuery}
          onChange={(val: string, meta?: any) => {
            setAreaQuery(val || "");
            if (meta) {
              const token = meta.outward || meta.sector || meta.postcode || "";
              if (token) addServiceArea(token);
              setAreaQuery("");
            }
          }}
        />
        {form.serviceAreas.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {form.serviceAreas.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
              >
                {s}
                <button
                  type="button"
                  onClick={() => removeServiceArea(s)}
                  className="rounded-full p-0.5 text-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  aria-label={`Remove ${s}`}
                  title="Remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Website (single) */}
      <div className="mt-2" data-testid="website-field">
        <label className="text-sm">Website (optional)</label>
        <div className="mt-1">
          {!form.website ? (
            <div className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white">
                🌐
              </span>
              <span className="shrink-0 text-sm text-slate-700 w-28">
                Website
              </span>
              <input
                className="input h-11 flex-1 border-0 bg-transparent p-0 shadow-none focus:ring-0 placeholder:text-slate-400"
                placeholder="https://yourwebsite.com"
                value={websiteInput}
                onChange={(e) => setWebsiteInput(e.target.value)}
                onKeyDown={onWebsiteKey}
                onBlur={commitWebsite}
              />
              <button
                type="button"
                className="rounded-xl px-3 py-1.5 text-sm bg-slate-900 text-white hover:bg-slate-800"
                onClick={commitWebsite}
                aria-label="Add website"
              >
                + Add
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white">
                  🌐
                </span>
                <span className="shrink-0 text-sm text-slate-700 w-28">
                  Website
                </span>
                <a
                  href={form.website}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm link"
                >
                  {form.website.replace(/^https?:\/\//, "")}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-red-600"
                  onClick={clearWebsite}
                  aria-label="Remove website"
                  title="Remove"
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Social links */}
      <div className="mt-4" data-testid="socials">
        <label className="text-sm">Social links (optional)</label>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <SocialRow
            id="ig"
            brand="instagram"
            label="Instagram"
            placeholder="@yourhandle or profile URL"
            value={form.socials.instagram}
            onChange={(v) => set("socials", { ...form.socials, instagram: v })}
            onBlur={() => {
              const url = normalizeInstagram(form.socials.instagram);
              if (url) set("socials", { ...form.socials, instagram: url });
            }}
          />
          <SocialRow
            id="tt"
            brand="tiktok"
            label="TikTok"
            placeholder="@yourhandle or profile URL"
            value={form.socials.tiktok}
            onChange={(v) => set("socials", { ...form.socials, tiktok: v })}
            onBlur={() => {
              const url = normalizeTikTok(form.socials.tiktok);
              if (url) set("socials", { ...form.socials, tiktok: url });
            }}
          />
          <SocialRow
            id="fb"
            brand="facebook"
            label="Facebook"
            placeholder="Page name or URL"
            value={form.socials.facebook}
            onChange={(v) => set("socials", { ...form.socials, facebook: v })}
            onBlur={() => {
              const url = normalizeFacebook(form.socials.facebook);
              if (url) set("socials", { ...form.socials, facebook: url });
            }}
          />
          <SocialRow
            id="tw"
            brand="x"
            label="X (Twitter)"
            placeholder="@yourhandle or profile URL"
            value={form.socials.x}
            onChange={(v) => set("socials", { ...form.socials, x: v })}
            onBlur={() => {
              const url = normalizeX(form.socials.x);
              if (url) set("socials", { ...form.socials, x: url });
            }}
          />
          <SocialRow
            id="yt"
            brand="youtube"
            label="YouTube"
            placeholder="@yourhandle or channel URL"
            value={form.socials.youtube}
            onChange={(v) => set("socials", { ...form.socials, youtube: v })}
            onBlur={() => {
              const url = normalizeYouTube(form.socials.youtube);
              if (url) set("socials", { ...form.socials, youtube: url });
            }}
          />
          <SocialRow
            id="li"
            brand="linkedin"
            label="LinkedIn"
            placeholder="Company page or URL"
            value={form.socials.linkedin}
            onChange={(v) => set("socials", { ...form.socials, linkedin: v })}
            onBlur={() => {
              const url = normalizeLinkedIn(form.socials.linkedin);
              if (url) set("socials", { ...form.socials, linkedin: url });
            }}
          />
        </div>
      </div>

      <div className="mt-1 flex items-center justify-end gap-2">
        <button
          className="rounded-xl px-4 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800"
          data-testid="btn-next"
          disabled={
            !canProceed &&
            false /* kept for API parity; handler controls flow */
          }
        >
          Next
        </button>
      </div>

      {!userIsAuthed && (
        <p
          className="text-sm text-slate-600"
          data-testid="vendor-already-member"
        >
          Already a member?{" "}
          <a
            className="link"
            href={`/login${nextQuery}`}
            data-testid="link-vendor-signin"
          >
            Sign in
          </a>
        </p>
      )}
    </form>
  );
}
