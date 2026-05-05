import { ChevronLeft, X } from "lucide-react";

type Props = {
  title: string;
  onBack: () => void;
  onClose: () => void;
};

export default function WizardTopBar({ title, onBack, onClose }: Props) {
  return (
    <div className="bg-white border-b border-gray-100 flex items-center gap-3 px-[14px] py-[11px] flex-shrink-0">
      <button
        type="button"
        aria-label="Back"
        onClick={onBack}
        className="w-[30px] h-[30px] rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
      >
        <ChevronLeft className="w-4 h-4 text-gray-900" />
      </button>
      <span className="flex-1 text-[15px] font-extrabold text-gray-900">{title}</span>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="w-[30px] h-[30px] rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
      >
        <X className="w-4 h-4 text-gray-900" />
      </button>
    </div>
  );
}
