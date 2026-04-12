import { useEffect } from "react";

type Props = {
  message: string | null;
  onDismiss: () => void;
  duration?: number;
};

export default function Toast({ message, onDismiss, duration = 2500 }: Props) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [message, onDismiss, duration]);

  if (!message) return null;

  return (
    <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center pointer-events-none">
      <div className="pointer-events-auto rounded-full bg-emerald-600 text-white text-sm font-medium px-5 py-2.5 shadow-lg animate-slide-in-left">
        {message}
      </div>
    </div>
  );
}
