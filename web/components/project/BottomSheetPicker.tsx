// web/components/project/BottomSheetPicker.tsx
//
// Single-select picker rendered inside the shared BottomSheet shell.
// Used by /projects mobile filter chips (Type / Status / Sort).

import BottomSheet from "@/components/BottomSheet";

export type BottomSheetPickerOption = {
  value: string;
  label: string;
  /** Optional small grey suffix (e.g. count). */
  hint?: string;
};

export type BottomSheetPickerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  options: BottomSheetPickerOption[];
  /** Currently selected value. "" means "no selection / clear filter". */
  selected: string;
  onSelect: (value: string) => void;
  /** Whether to show a "Clear filter" button under Done. Default: true if a value is selected. */
  clearable?: boolean;
  /** Test id for the option list container. */
  testId?: string;
};

export default function BottomSheetPicker({
  open,
  onClose,
  title,
  subtitle,
  options,
  selected,
  onSelect,
  clearable,
  testId,
}: BottomSheetPickerProps) {
  const showClear = clearable ?? !!selected;

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel={title}>
      {/* Header */}
      <div className="text-center px-6">
        <h3 className="text-[19px] font-extrabold tracking-tight text-gray-900">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-1.5 mx-2 text-[13px] text-gray-500 leading-snug">
            {subtitle}
          </p>
        )}
      </div>

      {/* Options list */}
      <div
        className="px-5 pt-4 max-h-[55vh] overflow-y-auto"
        data-testid={testId}
      >
        <div className="flex flex-col gap-1.5">
          {options.map((opt) => {
            const isActive = opt.value === selected;
            return (
              <button
                key={opt.value || "__all__"}
                type="button"
                onClick={() => {
                  onSelect(opt.value);
                  onClose();
                }}
                className={[
                  "flex items-center justify-between w-full min-h-[48px] px-4 rounded-2xl border-[1.5px]",
                  isActive
                    ? "bg-indigo-50 text-indigo-700 border-indigo-200 font-extrabold"
                    : "bg-white text-gray-800 border-gray-200 font-semibold",
                ].join(" ")}
                aria-pressed={isActive}
                data-testid={`picker-option-${opt.value || "all"}`}
              >
                <span className="flex items-center gap-2 text-[14px]">
                  <span>{opt.label}</span>
                  {opt.hint && (
                    <span
                      className={
                        isActive
                          ? "text-indigo-400 text-[12px] font-bold"
                          : "text-gray-400 text-[12px] font-bold"
                      }
                    >
                      {opt.hint}
                    </span>
                  )}
                </span>
                {isActive && (
                  <span aria-hidden className="text-indigo-600 text-[15px] font-extrabold">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer actions */}
      <div
        className="px-5 pt-4 pb-5 flex flex-col gap-2"
        style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-gray-900 text-white font-extrabold text-[14px]"
        >
          Done
        </button>
        {showClear && (
          <button
            type="button"
            onClick={() => {
              onSelect("");
              onClose();
            }}
            className="w-full py-2.5 text-gray-500 underline font-semibold text-[13px]"
          >
            Clear filter
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
