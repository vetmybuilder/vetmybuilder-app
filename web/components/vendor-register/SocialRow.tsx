// web/components/vendor-register/SocialRow.tsx
import {
  IconInstagram,
  IconTikTok,
  IconFacebook,
  IconX,
  IconYouTube,
  IconLinkedIn,
} from "./icons";

const brandChip: Record<string, string> = {
  instagram: "bg-gradient-to-tr from-pink-500 to-violet-500",
  tiktok: "bg-black",
  facebook: "bg-blue-600",
  x: "bg-black",
  youtube: "bg-red-600",
  linkedin: "bg-sky-700",
};

const BrandIcon: Record<string, any> = {
  instagram: IconInstagram,
  tiktok: IconTikTok,
  facebook: IconFacebook,
  x: IconX,
  youtube: IconYouTube,
  linkedin: IconLinkedIn,
};

type Props = {
  id: string;
  brand: "instagram" | "tiktok" | "facebook" | "x" | "youtube" | "linkedin";
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
};

export default function SocialRow(props: Props) {
  const { id, brand, label, placeholder, value, onChange, onBlur } = props;
  const ChipIcon = BrandIcon[brand];
  return (
    <div
      className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500"
      data-testid={`social-${brand}`}
    >
      <span
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white ${brandChip[brand]}`}
      >
        <ChipIcon />
      </span>
      <span className="shrink-0 text-sm text-slate-700 w-28">{label}</span>
      <input
        id={id}
        className="input h-11 flex-1 border-0 bg-transparent p-0 shadow-none focus:ring-0 placeholder:text-slate-400"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}
