// web/components/vendor-register/Step3Offers.tsx
import React, { useEffect, useState } from "react";
import Link from "next/link";
import SupportingDocsField, {
  type SupportingDoc,
} from "./SupportingDocsField";

type Props = {
  discountMin: number;
  discountMax: number;
  setDiscountMin: (v: number) => void;
  setDiscountMax: (v: number) => void;
  warranty: "none" | "3m" | "6m" | "12m" | "24m+";
  setWarranty: (v: "none" | "3m" | "6m" | "12m" | "24m+") => void;
  docs: SupportingDoc[];
  onDocsChange: (docs: SupportingDoc[]) => void;
  onBack: () => void;
  onSaveDraft: (e: React.FormEvent) => void;
  busy?: boolean;
  okMsg?: string | null;
  err?: string | null;
  primaryLabel?: string;
  showTermsCheckbox?: boolean;
};

const MAX_DISCOUNT = 25;
const WARRANTY_LABELS: Record<Props["warranty"], string> = {
  none: "None",
  "3m": "3m",
  "6m": "6m",
  "12m": "12m",
  "24m+": "24m+",
};

export default function Step3Offers({
  discountMin,
  discountMax,
  setDiscountMin,
  setDiscountMax,
  warranty,
  setWarranty,
  docs,
  onDocsChange,
  onSaveDraft,
  okMsg,
  err,
  showTermsCheckbox = false,
}: Props) {
  const [agreedTerms, setAgreedTerms] = useState(false);

  // The mock collapses the old dual-slider into a single max-discount track:
  // "0% – {max}%". Force min to 0 so the displayed range stays anchored at 0.
  useEffect(() => {
    if (discountMin !== 0) setDiscountMin(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fillPct = `${(discountMax / MAX_DISCOUNT) * 100}%`;

  return (
    <form
      className="space-y-0 pb-4"
      onSubmit={onSaveDraft}
      data-testid="step-3"
    >
      <style>{`
        .vmb-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 9999px;
          outline: none;
          cursor: pointer;
          background: transparent;
          position: relative;
          z-index: 2;
        }
        .vmb-slider::-webkit-slider-runnable-track {
          height: 6px;
          background: transparent;
        }
        .vmb-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          margin-top: -7px;
          border-radius: 50%;
          background: white;
          border: 2.5px solid #059669;
          box-shadow: 0 2px 6px rgba(5,150,105,0.3);
          cursor: pointer;
        }
        .vmb-slider::-moz-range-track {
          height: 6px;
          background: transparent;
        }
        .vmb-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          border: 2.5px solid #059669;
          box-shadow: 0 2px 6px rgba(5,150,105,0.3);
          cursor: pointer;
        }
      `}</style>

      {/* Step heading */}
      <div className="px-3.5 pt-4 pb-2">
        <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-emerald-600 mb-0.5">
          Offers &amp; warranty
        </p>
        <h2 className="text-[18px] font-extrabold text-gray-900 leading-tight">
          Stand out to homeowners
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Discounts and warranties can boost your match rate.
        </p>
      </div>

      {/* ── Discount offered ── */}
      <div
        data-testid="discount-range"
        className="bg-white rounded-xl mx-3 my-2 px-4 py-4 text-center"
      >
        <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-zinc-500">
          Discount offered
        </div>
        <div className="mt-1 text-2xl font-black text-emerald-700 leading-tight">
          Up to {discountMax}%
        </div>

        <div className="relative mt-3">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-zinc-100" />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-emerald-600"
            style={{ left: 0, width: fillPct }}
          />
          <input
            id="discMax"
            type="range"
            min={0}
            max={MAX_DISCOUNT}
            value={discountMax}
            onChange={(e) => setDiscountMax(Number(e.target.value))}
            className="vmb-slider relative"
            aria-label="Maximum discount you can offer"
            data-testid="input-discount-max"
          />
        </div>
      </div>

      {/* ── Warranty pills ── */}
      <div
        data-testid="warranty-select"
        className="bg-white rounded-xl mx-3 my-2 px-4 py-4"
      >
        <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-zinc-500 text-center">
          Warranty offered
        </div>
        <div
          className="mt-3 flex items-center justify-between gap-1.5"
          role="listbox"
          aria-label="Warranty options"
        >
          {(["none", "3m", "6m", "12m", "24m+"] as const).map((opt) => {
            const active = warranty === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setWarranty(opt)}
                className={`flex-1 py-2 rounded-full text-sm font-bold transition-colors ${
                  active
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-500"
                    : "bg-white text-zinc-700 border border-zinc-200"
                }`}
                aria-pressed={active}
                data-testid={`warranty-${opt}`}
              >
                {WARRANTY_LABELS[opt]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Insurance, certs, memberships ──
          Rendered without an outer card wrapper so the doc tiles become
          the primary visual unit (native-app feel) instead of a card-
          inside-a-card. */}
      <p className="px-3.5 pt-3 pb-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-zinc-500">
        Insurance, certs &amp; memberships
      </p>
      <div className="mx-3 my-2">
        <SupportingDocsField docs={docs} onChange={onDocsChange} />
      </div>

      {okMsg && (
        <p
          className="mx-3 text-sm text-emerald-600 font-medium"
          data-testid="join-ok"
        >
          {okMsg}
        </p>
      )}
      {err && (
        <p
          className="mx-3 text-sm text-red-600 font-medium"
          role="alert"
          data-testid="join-error"
        >
          {err}
        </p>
      )}

      {showTermsCheckbox && (
        <label
          className="mx-3 mt-2 flex items-start gap-2.5 cursor-pointer"
          data-testid="agree-terms"
        >
          <input
            type="checkbox"
            checked={agreedTerms}
            onChange={(e) => setAgreedTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-xs text-zinc-500 leading-relaxed">
            By signing up, I agree to the{" "}
            <Link
              href="/terms"
              target="_blank"
              className="text-emerald-600 hover:underline"
            >
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link
              href="/acceptable-use"
              target="_blank"
              className="text-emerald-600 hover:underline"
            >
              Acceptable Use Policy
            </Link>
            .
          </span>
        </label>
      )}

      <button
        type="submit"
        className="sr-only"
        data-testid="btn-continue"
        aria-hidden="true"
        disabled={showTermsCheckbox && !agreedTerms}
      >
        Next
      </button>
    </form>
  );
}
