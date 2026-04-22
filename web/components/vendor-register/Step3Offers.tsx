// web/components/vendor-register/Step3Offers.tsx
import React, { useState } from "react";
import Link from "next/link";
import { Tag, ShieldCheck, FileText, ArrowRight, ArrowLeft } from "lucide-react";

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
      className="bg-white rounded-2xl shadow-lg shadow-zinc-200/60 p-7 sm:p-9 space-y-8"
      onSubmit={onSaveDraft}
      data-testid="step-3"
    >
      {/* Custom slider styles */}
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
            #ef4444 var(--pct, 0%),
            #f4f4f5 var(--pct, 0%)
          );
        }
        .vmb-slider::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 9999px;
          background: linear-gradient(
            to right,
            #ef4444 var(--pct, 0%),
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
          border: 2.5px solid #ef4444;
          box-shadow: 0 2px 8px rgba(239, 68, 68, 0.35), 0 1px 3px rgba(0,0,0,0.1);
          cursor: pointer;
          transition: transform 0.1s, box-shadow 0.1s;
        }
        .vmb-slider::-webkit-slider-thumb:hover {
          transform: scale(1.18);
          box-shadow: 0 4px 14px rgba(239, 68, 68, 0.45), 0 1px 3px rgba(0,0,0,0.1);
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
          background: #ef4444;
        }
        .vmb-slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: white;
          border: 2.5px solid #ef4444;
          box-shadow: 0 2px 8px rgba(239, 68, 68, 0.35);
          cursor: pointer;
        }
      `}</style>

      {/* ── Discount section ── */}
      <div data-testid="discount-range" className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Tag className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-bold text-zinc-800">Discount you can offer if hired</span>
          </div>
          <p className="text-xs text-zinc-400 ml-6">Bigger discounts tend to win more work. Choose a realistic range.</p>
        </div>

        {/* Value display pill */}
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center gap-3 rounded-2xl bg-red-50 border border-red-100 px-6 py-3">
            <div className="text-center">
              <div className="text-3xl font-black text-red-500 leading-none">{discountMin}%</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-red-300 mt-1">Min</div>
            </div>
            <div className="text-xl text-red-200 font-light px-1">—</div>
            <div className="text-center">
              <div className="text-3xl font-black text-red-500 leading-none">{discountMax}%</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-red-300 mt-1">Max</div>
            </div>
          </div>
        </div>

        {/* Sliders */}
        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400" htmlFor="discMin">Min %</label>
              <span className="text-sm font-bold text-red-500">{discountMin}%</span>
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
              <span className="text-sm font-bold text-red-500">{discountMax}%</span>
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
      <div data-testid="warranty-select" className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-bold text-zinc-800">Warranty on your work</span>
        </div>
        <div className="flex flex-wrap gap-2" role="listbox" aria-label="Warranty options">
          {(["none", "3m", "6m", "12m", "24m+"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setWarranty(opt)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                warranty === opt
                  ? "bg-red-500 text-white shadow-sm shadow-red-500/30"
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
      <div data-testid="supporting-docs" className="space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-bold text-zinc-800">Supporting documents</span>
        </div>
        <p className="text-xs text-zinc-400 ml-6">
          Upload insurance, memberships or certifications (optional). You can return to your profile later to add more.
        </p>
        <input
          type="file"
          multiple
          onChange={onDocs}
          className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-red-50 file:px-4 file:py-1.5 file:text-sm file:font-semibold file:text-red-600 hover:file:bg-red-100 transition-colors"
          data-testid="input-docs"
        />
      </div>

      {okMsg && (
        <p className="text-sm text-emerald-600 font-medium" data-testid="join-ok">{okMsg}</p>
      )}
      {err && (
        <p className="text-sm text-red-600 font-medium" role="alert" data-testid="join-error">{err}</p>
      )}

      {showTermsCheckbox && (
        <label className="flex items-start gap-2.5 cursor-pointer" data-testid="agree-terms">
          <input
            type="checkbox"
            checked={agreedTerms}
            onChange={(e) => setAgreedTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-red-500 focus:ring-red-500"
          />
          <span className="text-xs text-zinc-500 leading-relaxed">
            By signing up, I agree to the{" "}
            <Link href="/terms" target="_blank" className="text-red-500 hover:underline">Terms of Use</Link>
            {" "}and{" "}
            <Link href="/acceptable-use" target="_blank" className="text-red-500 hover:underline">Acceptable Use Policy</Link>.
          </span>
        </label>
      )}

      <div className="flex items-center justify-between border-t border-zinc-100 pt-6">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border-2 border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
          onClick={onBack}
          data-testid="btn-back"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          className={`inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-colors disabled:cursor-not-allowed ${busy ? "bg-zinc-400" : "bg-red-500 shadow-red-500/25 hover:bg-red-600 active:scale-95 disabled:opacity-60"}`}
          disabled={busy || (showTermsCheckbox && !agreedTerms)}
          data-testid="btn-continue"
        >
          {busy ? <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg> : null}
          {busy ? "Saving…" : primaryLabel}
          {!busy && <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </form>
  );
}
