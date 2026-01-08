// web/components/vendor-register/Step3Offers.tsx
import React from "react";

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

  /** Override the bottom-right submit button label (defaults to "Next") */
  primaryLabel?: string;
};

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
}: Props) {
  return (
    <form
      className="card grid gap-4"
      onSubmit={onSaveDraft}
      data-testid="step-3"
    >
      <div data-testid="discount-range">
        <div className="flex items-end justify-between">
          <label className="text-sm font-medium">
            Discount you can offer if hired
          </label>
          <span className="text-sm text-slate-600">
            {discountMin}% – {discountMax}%
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-2">
          Bigger discounts tend to win more work. Choose a realistic range.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500" htmlFor="discMin">
              Min %
            </label>
            <input
              id="discMin"
              type="range"
              min={0}
              max={25}
              value={discountMin}
              onChange={(e) => setDiscountMin(Number(e.target.value))}
              className="w-full"
              data-testid="input-discount-min"
            />
            <div className="text-xs text-slate-600 mt-1">{discountMin}%</div>
          </div>
          <div>
            <label className="text-xs text-slate-500" htmlFor="discMax">
              Max %
            </label>
            <input
              id="discMax"
              type="range"
              min={0}
              max={25}
              value={discountMax}
              onChange={(e) => setDiscountMax(Number(e.target.value))}
              className="w-full"
              data-testid="input-discount-max"
            />
            <div className="text-xs text-slate-600 mt-1">{discountMax}%</div>
          </div>
        </div>
      </div>

      <div data-testid="warranty-select">
        <label className="text-sm font-medium block mb-1">
          Warranty on your work
        </label>
        <div
          className="flex flex-wrap gap-2"
          role="listbox"
          aria-label="Warranty options"
        >
          {(["none", "3m", "6m", "12m", "24m+"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setWarranty(opt)}
              className={`px-3 py-1.5 rounded-xl text-sm ring-1 ${
                warranty === opt
                  ? "bg-indigo-600 text-white ring-indigo-500"
                  : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
              }`}
              aria-pressed={warranty === opt}
              data-testid={`warranty-${opt}`}
            >
              {opt === "none"
                ? "No warranty"
                : opt === "12m"
                ? "1 year"
                : opt === "24m+"
                ? "2+ years"
                : opt.replace("m", " months")}
            </button>
          ))}
        </div>
      </div>

      <div data-testid="supporting-docs">
        <label className="text-sm font-medium block mb-1">
          Supporting documents
        </label>
        <p className="text-xs text-slate-500 mb-2">
          Upload insurance, memberships or certifications (optional). You can
          return to your profile later to add more.
        </p>
        <input
          type="file"
          multiple
          onChange={onDocs}
          className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-indigo-700 file:hover:bg-indigo-100"
          data-testid="input-docs"
        />
      </div>

      {okMsg && (
        <p className="text-sm text-green-700" data-testid="join-ok">
          {okMsg}
        </p>
      )}
      {err && (
        <p
          className="text-sm text-red-600"
          role="alert"
          data-testid="join-error"
        >
          {err}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="rounded-xl px-4 py-2 text-sm bg-white ring-1 ring-slate-200 hover:bg-slate-50"
          onClick={onBack}
          data-testid="btn-back"
        >
          Back
        </button>
        <button
          className="rounded-xl px-4 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800"
          disabled={busy}
          data-testid="btn-continue"
        >
          {busy ? "Saving…" : primaryLabel}
        </button>
      </div>
    </form>
  );
}
