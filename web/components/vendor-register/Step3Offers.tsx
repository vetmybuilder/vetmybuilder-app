// web/components/vendor-register/Step3Offers.tsx
import React, { useState } from "react";
import Link from "next/link";
import { Tag, ShieldCheck, FileText } from "lucide-react";

type Props = {
  discountMin: number;
  discountMax: number;
  setDiscountMin: (v: number) => void;
  setDiscountMax: (v: number) => void;
  warranty: "none" | "3m" | "6m" | "12m" | "24m+";
  setWarranty: (v: "none" | "3m" | "6m" | "12m" | "24m+") => void;
  onDocs: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBack: () => void;
  onSaveDraft: (e: React.FormEvent) => void;
  busy?: boolean;
  okMsg?: string | null;
  err?: string | null;
  primaryLabel?: string;
  showTermsCheckbox?: boolean;
};

const MAX_DISCOUNT = 25;

function pct(val: number) {
  return `${(val / MAX_DISCOUNT) * 100}%`;
}

export default function Step3Offers({
  discountMin,
  discountMax,
  setDiscountMin,
  setDiscountMax,
  warranty,
  setWarranty,
  onDocs,
  onBack,
  onSaveDraft,
  busy,
  okMsg,
  err,
  primaryLabel = "Next",
  showTermsCheckbox = false,
}: Props) {
  const [agreedTerms, setAgreedTerms] = useState(false);

  return (
    <form
      className="space-y-0 pb-4"
      onSubmit={onSaveDraft}
      data-testid="step-3"
    >
      {/* Custom slider styles — emerald palette */}
      <style>{`
        .vmb-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 9999px;
          outline: none;
          cursor: pointer;
          background: linear-gradient(
            to right,
            #059669 var(--pct, 0%),
            #f4f4f5 var(--pct, 0%)
          );
        }
        .vmb-slider::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 9999px;
          background: linear-gradient(
            to right,
            #059669 var(--pct, 0%),
            #f4f4f5 var(--pct, 0%)
          );
        }
        .vmb-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 22px;
          height: 22px;
          margin-top: -8px;
          border-radius: 50%;
          background: white;
          border: 2.5px solid #059669;
          box-shadow: 0 2px 8px rgba(5, 150, 105, 0.35), 0 1px 3px rgba(0,0,0,0.1);
          cursor: pointer;
          transition: transform 0.1s, box-shadow 0.1s;
        }
        .vmb-slider::-webkit-slider-thumb:hover {
          transform: scale(1.18);
          box-shadow: 0 4px 14px rgba(5, 150, 105, 0.45), 0 1px 3px rgba(0,0,0,0.1);
        }
        .vmb-slider::-webkit-slider-thumb:active {
          transform: scale(1.25);
        }
        .vmb-slider::-moz-range-track {
          height: 6px;
          border-radius: 9999px;
          background: #f4f4f5;
        }
        .vmb-slider::-moz-range-progress {
          height: 6px;
          border-radius: 9999px;
          background: #059669;
        }
        .vmb-slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: white;
          border: 2.5px solid #059669;
          box-shadow: 0 2px 8px rgba(5, 150, 105, 0.35);
          cursor: pointer;
        }
      `}</style>

      {/* Step heading */}
      <div className="px-3.5 pt-4 pb-1">
        <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-emerald-600 mb-0.5">
          Offers &amp; warranty
        </p>
        <h2 className="text-[18px] font-extrabold text-gray-900 leading-tight">Stand out to homeowners</h2>
      </div>

      {/* ── Discount section ── */}
      <div data-testid="discount-range" className="bg-white rounded-xl mx-3 my-2 px-3.5 py-3 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Tag className="h-4 w-4 text-zinc-400" />
            <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-gray-500">Discount you can offer if hired</span>
          </div>
          <p className="text-xs text-zinc-400 ml-6">Bigger discounts tend to win more work. Choose a realistic range.</p>
        </div>

        {/* Value display pill */}
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center gap-3 rounded-2xl bg-emerald-50 border border-emerald-100 px-6 py-3">
            <div className="text-center">
              <div className="text-3xl font-black text-emerald-600 leading-none">{discountMin}%</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300 mt-1">Min</div>
            </div>
            <div className="text-xl text-emerald-200 font-light px-1">—</div>
            <div className="text-center">
              <div className="text-3xl font-black text-emerald-600 leading-none">{discountMax}%</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300 mt-1">Max</div>
            </div>
          </div>
        </div>

        {/* Sliders */}
        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400" htmlFor="discMin">Min %</label>
              <span className="text-sm font-bold text-emerald-600">{discountMin}%</span>
            </div>
            <input
              id="discMin"
              type="range"
              min={0}
              max={MAX_DISCOUNT}
              value={discountMin}
              onChange={(e) => setDiscountMin(Number(e.target.value))}
              className="vmb-slider"
              style={{ "--pct": pct(discountMin) } as React.CSSProperties}
              data-testid="input-discount-min"
            />
            <div className="flex justify-between text-[10px] text-zinc-300">
              <span>0%</span><span>{MAX_DISCOUNT}%</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400" htmlFor="discMax">Max %</label>
              <span className="text-sm font-bold text-emerald-600">{discountMax}%</span>
            </div>
            <input
              id="discMax"
              type="range"
              min={0}
              max={MAX_DISCOUNT}
              value={discountMax}
              onChange={(e) => setDiscountMax(Number(e.target.value))}
              className="vmb-slider"
              style={{ "--pct": pct(discountMax) } as React.CSSProperties}
              data-testid="input-discount-max"
            />
            <div className="flex justify-between text-[10px] text-zinc-300">
              <span>0%</span><span>{MAX_DISCOUNT}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Warranty section ── */}
      <div data-testid="warranty-select" className="bg-white rounded-xl mx-3 my-2 px-3.5 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-zinc-400" />
          <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-gray-500">Warranty on your work</span>
        </div>
        <div className="flex flex-wrap gap-2" role="listbox" aria-label="Warranty options">
          {(["none", "3m", "6m", "12m", "24m+"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setWarranty(opt)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                warranty === opt
                  ? "border border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
              aria-pressed={warranty === opt}
              data-testid={`warranty-${opt}`}
            >
              {opt === "none" ? "No warranty"
                : opt === "12m" ? "1 year"
                : opt === "24m+" ? "2+ years"
                : opt.replace("m", " months")}
            </button>
          ))}
        </div>
      </div>

      {/* ── Supporting docs ── */}
      <div data-testid="supporting-docs" className="bg-white rounded-xl mx-3 my-2 px-3.5 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-zinc-400" />
          <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-gray-500">Supporting documents</span>
        </div>
        <p className="text-xs text-zinc-400 ml-6">
          Upload insurance, memberships or certifications (optional). You can return to your profile later to add more.
        </p>
        <input
          type="file"
          multiple
          onChange={onDocs}
          className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-emerald-50 file:px-4 file:py-1.5 file:text-sm file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100 transition-colors"
          data-testid="input-docs"
        />
      </div>

      {okMsg && (
        <p className="mx-3 text-sm text-emerald-600 font-medium" data-testid="join-ok">{okMsg}</p>
      )}
      {err && (
        <p className="mx-3 text-sm text-red-600 font-medium" role="alert" data-testid="join-error">{err}</p>
      )}

      {showTermsCheckbox && (
        <label className="mx-3 flex items-start gap-2.5 cursor-pointer" data-testid="agree-terms">
          <input
            type="checkbox"
            checked={agreedTerms}
            onChange={(e) => setAgreedTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-xs text-zinc-500 leading-relaxed">
            By signing up, I agree to the{" "}
            <Link href="/terms" target="_blank" className="text-emerald-600 hover:underline">Terms of Use</Link>
            {" "}and{" "}
            <Link href="/acceptable-use" target="_blank" className="text-emerald-600 hover:underline">Acceptable Use Policy</Link>.
          </span>
        </label>
      )}

      {/* Hidden submit — triggered by WizardNavBar onNext via step handler */}
      <button type="submit" className="sr-only" data-testid="btn-continue" aria-hidden="true">Next</button>
    </form>
  );
}
