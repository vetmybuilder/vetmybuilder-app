import { Mail, MessageSquare } from "lucide-react";
import BottomSheet from "@/components/BottomSheet";

function WhatsAppIcon({ size = 22 }: { size?: number }) {
  // Official WhatsApp glyph (simplified for solid colour fill)
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982 1.0-3.648-.235-.374A9.86 9.86 0 0 1 2.15 11.892c.002-5.45 4.436-9.884 9.9-9.884 2.643 0 5.127 1.03 6.994 2.901a9.825 9.825 0 0 1 2.893 6.992c-.003 5.45-4.437 9.884-9.886 9.884zm8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.463 3.488z" />
    </svg>
  );
}

export default function ShareProjectModal({
  open,
  onClose,
  projectId,
  projectName,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string | null;
}) {
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/projects/${projectId}/recommend`
      : "";
  const projectLabel = projectName ? `my "${projectName}" project` : "my project";
  const messageBody = `Hey — I'm looking for a tradesperson for ${projectLabel}. If you know someone you'd recommend, please add them via VetMyBuilder: ${shareUrl}`;

  function viaWhatsApp() {
    window.location.href = `https://wa.me/?text=${encodeURIComponent(messageBody)}`;
  }
  function viaSms() {
    window.location.href = `sms:?body=${encodeURIComponent(messageBody)}`;
  }
  function viaEmail() {
    const subject = projectName
      ? `Recommendation for ${projectName}`
      : "Recommendation request";
    window.location.href = `mailto:?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(messageBody)}`;
  }

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel="Share project">
      {/* Header */}
      <>
        <div className="text-center px-6">
          <div className="text-[28px] leading-none mb-1.5" aria-hidden>↗</div>
          <h3 className="text-[19px] font-extrabold tracking-tight text-gray-900">
            Share your project
          </h3>
          <p className="mt-1.5 mx-2 text-[13px] text-gray-500 leading-snug">
            {projectName
              ? `Send "${projectName}" to someone who might know a great tradesperson.`
              : "Send to someone you trust who might know a great tradesperson."}
          </p>
        </div>

        {/* 3-up icon grid */}
        <div className="grid grid-cols-3 gap-2.5 px-5 pt-4">
          <button
            type="button"
            onClick={viaWhatsApp}
            className="bg-white border-[1.5px] border-gray-200 rounded-[18px] py-4 flex flex-col items-center gap-2 active:scale-95 transition-transform"
          >
            <span
              className="w-12 h-12 rounded-full flex items-center justify-center text-white"
              style={{ background: "linear-gradient(135deg, #25d366, #128c7e)" }}
            >
              <WhatsAppIcon size={22} />
            </span>
            <span className="text-[12px] font-extrabold tracking-tight text-gray-900">
              WhatsApp
            </span>
          </button>

          <button
            type="button"
            onClick={viaSms}
            className="bg-white border-[1.5px] border-gray-200 rounded-[18px] py-4 flex flex-col items-center gap-2 active:scale-95 transition-transform"
          >
            <span
              className="w-12 h-12 rounded-full flex items-center justify-center text-white"
              style={{ background: "linear-gradient(135deg, #5fcf65, #34c759)" }}
            >
              <MessageSquare size={22} />
            </span>
            <span className="text-[12px] font-extrabold tracking-tight text-gray-900">
              SMS
            </span>
          </button>

          <button
            type="button"
            onClick={viaEmail}
            className="bg-white border-[1.5px] border-gray-200 rounded-[18px] py-4 flex flex-col items-center gap-2 active:scale-95 transition-transform"
          >
            <span
              className="w-12 h-12 rounded-full flex items-center justify-center text-white"
              style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
            >
              <Mail size={22} />
            </span>
            <span className="text-[12px] font-extrabold tracking-tight text-gray-900">
              Email
            </span>
          </button>
        </div>

        {/* Message preview */}
        <div className="mx-5 mt-4">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-gray-500">
            Message preview
          </div>
          <p className="mt-1.5 text-[12px] text-gray-600 leading-[1.5] bg-gray-50 rounded-xl p-3 whitespace-pre-line">
            {messageBody}
          </p>
        </div>

        {/* Cancel */}
        <div
          className="px-5 pt-3 pb-5"
          style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl bg-white border-[1.5px] border-gray-200 text-gray-600 font-bold text-[14px]"
          >
            Cancel
          </button>
        </div>
      </>
    </BottomSheet>
  );
}
