import React, { useState } from "react";
import type { ServiceArea } from "@/utils/serviceAreas";
import { flattenServiceAreas } from "@/utils/serviceAreas";
import {
  Building2, User, Phone, Mail, Globe, MapPin,
  ChevronDown, ChevronUp, ArrowRight, KeyRound,
} from "lucide-react";
import LocationField from "@/components/forms/LocationField";
import {
  IconInstagram, IconTikTok, IconFacebook, IconX, IconYouTube, IconLinkedIn,
} from "./icons";
import {
  normalizeFacebook,
  normalizeInstagram,
  normalizeLinkedIn,
  normalizeTikTok,
  normalizeX,
  normalizeYouTube,
} from "@/utils/socialLinks";
import {
  REVIEW_PLATFORMS,
  normalizeReviewLink,
  type ReviewPlatformId,
} from "@/utils/reviewLinks";

export type Step1Form = {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  serviceAreas: ServiceArea[];
  website: string;
  socials: {
    instagram: string;
    tiktok: string;
    facebook: string;
    x: string;
    youtube: string;
    linkedin: string;
  };
  // External review-platform links keyed by platform id. Empty string =
  // not provided. Server validates per platform on save.
  reviewLinks: {
    trustpilot: string;
    bark: string;
    mybuilder: string;
    checkatrade: string;
    houzz: string;
    yell: string;
  };
};

type Props = {
  form: Step1Form;
  set<K extends keyof Step1Form>(k: K, v: Step1Form[K]): void;
  addServiceAreaOutward: (raw: string) => void;
  addServiceAreaBorough: (name: string, outwardCodes: string[]) => void;
  removeServiceAreaAt: (index: number) => void;
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
  errors?: Record<string, string | null>;

  // Only used by edit-profile page
  disableCompanyName?: boolean;
  disableBusinessEmail?: boolean;

  betaRequired?: boolean;
  betaCode?: string;
  setBetaCode?: (v: string) => void;
  betaCodeError?: string | null;
};

const fieldCls =
  "h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-11 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-400/20 transition-colors disabled:opacity-50";

const iconCls =
  "absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 pointer-events-none";

export default function Step1Company({
  form,
  set,
  addServiceAreaOutward,
  addServiceAreaBorough,
  removeServiceAreaAt,
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
  errors,
  disableCompanyName,
  disableBusinessEmail,
  betaRequired,
  betaCode,
  setBetaCode,
  betaCodeError,
}: Props) {
  const err = (field: string) => errors?.[field] || null;
  const [socialsOpen, setSocialsOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);

  const filledSocials = Object.values(form.socials).filter(Boolean).length;
  const filledReviews = form.reviewLinks
    ? Object.values(form.reviewLinks).filter(Boolean).length
    : 0;
  const reviewLinksDirty: Partial<Record<ReviewPlatformId, string>> = (
    form.reviewLinks || {}
  ) as Record<ReviewPlatformId, string>;
  // Per-platform inline error: set to the platform id when the user
  // typed a URL that didn't match the expected domain. Cleared on next
  // edit. Doesn't block submit (server validates again) but warns the
  // tradesperson before they progress.
  const [reviewLinkErrors, setReviewLinkErrors] = React.useState<
    Partial<Record<ReviewPlatformId, string>>
  >({});

  return (
    <form
      className="bg-white rounded-2xl shadow-lg shadow-zinc-200/60 p-7 sm:p-9 space-y-7"
      onSubmit={onNext}
      noValidate
      data-testid="step-1"
    >
      {/* Step header */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-200 text-xs font-semibold text-zinc-600">
            1
          </span>
          <h2 className="text-lg font-bold tracking-tight text-zinc-900">Company &amp; contact details</h2>
        </div>
        <p className="ml-8 text-sm text-zinc-500">
          Tell us about your business so homeowners can find you
        </p>
      </div>

      <div className="space-y-5">
        {/* Company name */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500" htmlFor="companyName" data-testid="label-company-name">
            Company name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Building2 className={iconCls} />
            <input
              id="companyName"
              className={`${fieldCls} ${err("companyName") ? "border-red-400 ring-2 ring-red-400/20" : ""}`}
              value={form.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              placeholder="Company Ltd"
              data-testid="input-company-name"
              disabled={disableCompanyName}
              aria-invalid={!!err("companyName")}
              aria-describedby={err("companyName") ? "companyName-error" : undefined}
            />
          </div>
          {err("companyName") && (
            <p id="companyName-error" className="text-sm text-red-600 mt-1" role="alert">
              {err("companyName")}
            </p>
          )}
        </div>

        {/* Contact name */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500" htmlFor="contactName" data-testid="label-contact-name">
            Contact name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <User className={iconCls} />
            <input
              id="contactName"
              className={`${fieldCls} ${err("contactName") ? "border-red-400 ring-2 ring-red-400/20" : ""}`}
              value={form.contactName}
              onChange={(e) => set("contactName", e.target.value)}
              placeholder="Your name"
              data-testid="input-contact-name"
              aria-invalid={!!err("contactName")}
              aria-describedby={err("contactName") ? "contactName-error" : undefined}
            />
          </div>
          {err("contactName") && (
            <p id="contactName-error" className="text-sm text-red-600 mt-1" role="alert">
              {err("contactName")}
            </p>
          )}
        </div>

        {/* Phone + Email */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500" htmlFor="phone" data-testid="label-phone">
              Phone <span className="text-zinc-400 font-normal normal-case">(optional)</span>
            </label>
            <div className="relative">
              <Phone className={iconCls} />
              <input
                id="phone"
                className={`${fieldCls} ${err("phone") ? "border-red-400 ring-2 ring-red-400/20" : ""}`}
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="020..."
                data-testid="input-phone"
                aria-invalid={!!err("phone")}
                aria-describedby={err("phone") ? "phone-error" : undefined}
              />
            </div>
            {err("phone") && (
              <p id="phone-error" className="text-sm text-red-600 mt-1" role="alert">
                {err("phone")}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500" htmlFor="email" data-testid="label-email">
              Business email <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Mail className={iconCls} />
              <input
                id="email"
                className={`${fieldCls} ${err("email") ? "border-red-400 ring-2 ring-red-400/20" : ""}`}
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
                data-testid="input-email"
                aria-invalid={!!err("email")}
                aria-describedby={err("email") ? "email-error" : undefined}
                disabled={disableBusinessEmail}
              />
            </div>
            {err("email") && (
              <p id="email-error" className="text-sm text-red-600 mt-1" role="alert">{err("email")}</p>
            )}
          </div>
        </div>
        <p className="text-xs text-zinc-400 -mt-2">We use your contact details so homeowners can reach you</p>

        {/* Beta code */}
        {betaRequired && (
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500" htmlFor="betaCode" data-testid="label-beta-code">
              Beta access code <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <KeyRound className={iconCls} />
              <input
                id="betaCode"
                className={`${fieldCls} ${betaCodeError ? "border-red-400 ring-2 ring-red-400/20" : ""}`}
                type="text"
                value={betaCode ?? ""}
                onChange={(e) => setBetaCode?.(e.target.value)}
                placeholder="Enter your beta access code"
                data-testid="input-beta-code"
                aria-invalid={!!betaCodeError}
                aria-describedby={betaCodeError ? "beta-code-error" : undefined}
              />
            </div>
            {betaCodeError && (
              <p id="beta-code-error" className="text-sm text-red-600" role="alert" data-testid="beta-code-error">
                {betaCodeError}
              </p>
            )}
          </div>
        )}

        {/* Service areas */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-500" data-testid="label-areas">
            <MapPin className="h-3.5 w-3.5 text-zinc-400" />
            Service areas <span className="text-red-500">*</span>{" "}
            <span className="text-zinc-400 font-normal normal-case">(postcode sectors)</span>
          </label>
          {err("serviceAreas") && (
            <p className="text-sm text-red-600 mt-1" role="alert">
              {err("serviceAreas")}
            </p>
          )}
          <div data-testid="input-areas">
            <LocationField
              label=""
              reasonText=""
              placeholder="Type a postcode or place… e.g., E4, N17, Chingford, Waltham Forest"
              value={areaQuery}
              onChange={(val: string, meta?: any) => {
                setAreaQuery(val || "");
                if (!meta) return;
                if (meta.borough) {
                  addServiceAreaBorough(meta.borough.name, meta.borough.outwardCodes);
                  setAreaQuery("");
                  return;
                }
                const token = meta.outward || meta.sector || meta.postcode || "";
                if (token) {
                  addServiceAreaOutward(token);
                  setAreaQuery("");
                }
              }}
            />
          </div>
          {form.serviceAreas.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {form.serviceAreas.map((area, index) => {
                const label = area.kind === "outward" ? area.code : area.name;
                return (
                  <span
                    key={`${area.kind}-${label}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700"
                    data-testid={`service-area-chip-${label}`}
                  >
                    {label}
                    <button
                      type="button"
                      onClick={() => removeServiceAreaAt(index)}
                      className="rounded-full text-zinc-400 hover:text-zinc-700"
                      aria-label={`Remove ${label}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {form.serviceAreas.length > 0 && (
            <p
              className="mt-2 text-xs text-zinc-500"
              data-testid="service-areas-preview"
            >
              Covers: {flattenServiceAreas(form.serviceAreas).join(", ")}
            </p>
          )}
        </div>

        {/* Website */}
        <div className="space-y-1.5" data-testid="website-field">
          <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
            Website <span className="text-zinc-400 font-normal normal-case">(optional)</span>
          </label>
          {!form.website ? (
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-400/20 transition-colors">
              <Globe className="h-4 w-4 shrink-0 text-zinc-400" />
              <input
                className="h-12 flex-1 border-0 bg-transparent text-sm placeholder:text-zinc-400 focus:outline-none"
                placeholder="https://yourwebsite.com"
                value={websiteInput}
                onChange={(e) => setWebsiteInput(e.target.value)}
                onKeyDown={onWebsiteKey}
                onBlur={commitWebsite}
              />
              <button
                type="button"
                className="shrink-0 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors"
                onClick={commitWebsite}
              >
                + Add
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 h-12">
              <div className="flex items-center gap-2 min-w-0">
                <Globe className="h-4 w-4 shrink-0 text-zinc-400" />
                <a href={form.website} target="_blank" rel="noreferrer" className="truncate text-sm text-red-500 hover:underline">
                  {form.website.replace(/^https?:\/\//, "")}
                </a>
              </div>
              <button type="button" className="shrink-0 text-xs text-zinc-400 hover:text-red-500 ml-3" onClick={clearWebsite}>
                Remove
              </button>
            </div>
          )}
        </div>

        {/* Social links — collapsible */}
        <div className="space-y-2" data-testid="socials">
          <button
            type="button"
            onClick={() => setSocialsOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left hover:bg-zinc-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              {/* Social icons row */}
              <div className="flex -space-x-1">
                {/* Instagram */}
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </span>
                {/* TikTok */}
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                  </svg>
                </span>
                {/* Facebook */}
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </span>
                {/* X */}
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </span>
              </div>
              <span className="text-sm font-medium text-zinc-700">Social links</span>
              <span className="text-xs text-zinc-400">(optional)</span>
              {filledSocials > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
                  {filledSocials} added
                </span>
              )}
            </div>
            {socialsOpen ? (
              <ChevronUp className="h-4 w-4 text-zinc-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            )}
          </button>

          {socialsOpen && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 grid gap-3 sm:grid-cols-2" data-testid="socials-grid">
              {([
                {
                  id: "ig", key: "instagram" as const, label: "Instagram",
                  placeholder: "@yourhandle or profile URL",
                  Icon: IconInstagram,
                  hover: "hover:border-pink-300 hover:[&_.icon]:text-pink-500 hover:[&_.name]:text-pink-500",
                  normalize: normalizeInstagram,
                },
                {
                  id: "tt", key: "tiktok" as const, label: "TikTok",
                  placeholder: "@yourhandle or profile URL",
                  Icon: IconTikTok,
                  hover: "hover:border-zinc-700 hover:[&_.icon]:text-zinc-900 hover:[&_.name]:text-zinc-900",
                  normalize: normalizeTikTok,
                },
                {
                  id: "fb", key: "facebook" as const, label: "Facebook",
                  placeholder: "Page name or URL",
                  Icon: IconFacebook,
                  hover: "hover:border-blue-300 hover:[&_.icon]:text-blue-600 hover:[&_.name]:text-blue-600",
                  normalize: normalizeFacebook,
                },
                {
                  id: "tw", key: "x" as const, label: "X (Twitter)",
                  placeholder: "@yourhandle or profile URL",
                  Icon: IconX,
                  hover: "hover:border-zinc-700 hover:[&_.icon]:text-zinc-900 hover:[&_.name]:text-zinc-900",
                  normalize: normalizeX,
                },
                {
                  id: "yt", key: "youtube" as const, label: "YouTube",
                  placeholder: "@yourhandle or channel URL",
                  Icon: IconYouTube,
                  hover: "hover:border-red-300 hover:[&_.icon]:text-red-500 hover:[&_.name]:text-red-500",
                  normalize: normalizeYouTube,
                },
                {
                  id: "li", key: "linkedin" as const, label: "LinkedIn",
                  placeholder: "Company page or URL",
                  Icon: IconLinkedIn,
                  hover: "hover:border-sky-300 hover:[&_.icon]:text-sky-700 hover:[&_.name]:text-sky-700",
                  normalize: normalizeLinkedIn,
                },
              ] as const).map(({ id, key, label, placeholder, Icon, hover, normalize }) => (
                <div
                  key={id}
                  data-testid={`social-${key}`}
                  className={`flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 transition-colors focus-within:border-red-300 focus-within:ring-2 focus-within:ring-red-400/20 ${hover}`}
                >
                  <span className="icon shrink-0 text-zinc-400 transition-colors">
                    <Icon />
                  </span>
                  <span className="name shrink-0 w-24 text-sm font-medium text-zinc-500 transition-colors">{label}</span>
                  <input
                    id={id}
                    className="flex-1 border-0 bg-transparent text-sm placeholder:text-zinc-300 focus:outline-none min-w-0"
                    placeholder={placeholder}
                    value={form.socials[key]}
                    onChange={(e) => set("socials", { ...form.socials, [key]: e.target.value })}
                    onBlur={() => { const url = normalize(form.socials[key]); if (url) set("socials", { ...form.socials, [key]: url }); }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* External review-platform links - collapsible.
            Tradesperson supplies their own profile URL per platform;
            we display as plain text link on the public profile.
            See web/utils/reviewLinks.ts for normalisation rules and
            DMCC-safe display constraints. */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setReviewsOpen(!reviewsOpen)}
            className="w-full flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left hover:border-zinc-300 transition-colors"
            data-testid="btn-toggle-review-links"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-medium text-zinc-700">
                External review profiles
              </span>
              <span className="text-xs text-zinc-400">(optional)</span>
              {filledReviews > 0 && (
                <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs font-semibold">
                  {filledReviews} added
                </span>
              )}
            </div>
            {reviewsOpen ? (
              <ChevronUp className="h-4 w-4 text-zinc-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            )}
          </button>

          {reviewsOpen && (
            <div
              className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 grid gap-3 sm:grid-cols-2"
              data-testid="review-links-grid"
            >
              {REVIEW_PLATFORMS.map((p) => {
                const value = reviewLinksDirty[p.id] ?? "";
                const errorKey = reviewLinkErrors[p.id];
                return (
                  <div
                    key={p.id}
                    data-testid={`review-link-${p.id}`}
                    className="flex flex-col gap-1"
                  >
                    <div
                      className={`flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5 transition-colors focus-within:border-red-300 focus-within:ring-2 focus-within:ring-red-400/20 ${
                        errorKey
                          ? "border-rose-300"
                          : "border-zinc-200 hover:border-zinc-300"
                      }`}
                    >
                      <span className="name shrink-0 w-28 text-sm font-medium text-zinc-500">
                        {p.label}
                      </span>
                      <input
                        id={`review-${p.id}`}
                        className="flex-1 border-0 bg-transparent text-sm placeholder:text-zinc-300 focus:outline-none min-w-0"
                        placeholder={p.placeholder}
                        value={value}
                        data-testid={`input-review-${p.id}`}
                        onChange={(e) => {
                          set("reviewLinks", {
                            ...form.reviewLinks,
                            [p.id]: e.target.value,
                          });
                          if (errorKey) {
                            setReviewLinkErrors({
                              ...reviewLinkErrors,
                              [p.id]: undefined,
                            });
                          }
                        }}
                        onBlur={() => {
                          const raw = form.reviewLinks?.[p.id] || "";
                          if (!raw) return;
                          const norm = normalizeReviewLink(p.id, raw);
                          if (norm) {
                            // Persist canonicalised form
                            set("reviewLinks", {
                              ...form.reviewLinks,
                              [p.id]: norm,
                            });
                          } else {
                            setReviewLinkErrors({
                              ...reviewLinkErrors,
                              [p.id]: `Must be a ${p.label} URL`,
                            });
                          }
                        }}
                      />
                    </div>
                    {errorKey && (
                      <p
                        className="text-xs text-rose-600 pl-1"
                        role="alert"
                        data-testid={`error-review-${p.id}`}
                      >
                        {errorKey}
                      </p>
                    )}
                  </div>
                );
              })}
              <p className="text-[11px] text-zinc-400 sm:col-span-2">
                We display these as plain text links on your profile so
                homeowners can verify your reviews on the source. We
                don&apos;t copy ratings or review counts across.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-zinc-100 pt-6">
        <p className="text-xs text-zinc-400">
          <span className="text-red-500">*</span> Required fields
        </p>
        <div className="flex items-center gap-4">
          {!userIsAuthed && (
            <p className="text-sm text-zinc-500" data-testid="vendor-already-member">
              Already a member?{" "}
              <a className="font-medium text-red-500 hover:underline" href={`/login${nextQuery}`} data-testid="link-vendor-signin">
                Sign in
              </a>
            </p>
          )}
          <button
            className="inline-flex items-center gap-2 rounded-full bg-red-500 px-6 py-2.5 text-sm font-bold text-white shadow-sm shadow-red-500/25 hover:bg-red-600 transition-colors"
            data-testid="btn-next"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </form>
  );
}
