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
      className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-8 grid gap-5"
      onSubmit={onSaveDraft}
      data-testid="step-3"
    >
      <div data-testid="discount-range">
        <div className="flex items-end justify-between">
          <label className="text-sm font-medium">
            Discount you can offer if hired
          </label>
          <span className="text-sm text-zinc-500">
            {discountMin}% – {discountMax}%
          </span>
        </div>
        <p className="text-xs text-zinc-400 mb-2">
          Bigger discounts tend to win more work. Choose a realistic range.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-400" htmlFor="discMin">
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
            <div className="text-xs text-zinc-500 mt-1">{discountMin}%</div>
          </div>
          <div>
            <label className="text-xs text-zinc-400" htmlFor="discMax">
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
            <div className="text-xs text-zinc-500 mt-1">{discountMax}%</div>
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
                  ? "bg-red-500 text-white ring-red-400"
                  : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50"
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
        <p className="text-xs text-zinc-400 mb-2">
          Upload insurance, memberships or certifications (optional). You can
          return to your profile later to add more.
        </p>
        <input
          type="file"
          multiple
          onChange={onDocs}
          className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-red-50 file:px-3 file:py-1.5 file:text-red-600 file:hover:bg-red-100 file:font-bold"
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
          className="inline-flex items-center justify-center rounded-full border-2 border-zinc-200 bg-white px-6 py-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition-all"
          onClick={onBack}
          data-testid="btn-back"
        >
          Back
        </button>
        <button
          className="inline-flex items-center justify-center rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          disabled={busy}
          data-testid="btn-continue"
        >
          {busy ? "Saving…" : primaryLabel}
        </button>
      </div>
    </form>
  );
}
