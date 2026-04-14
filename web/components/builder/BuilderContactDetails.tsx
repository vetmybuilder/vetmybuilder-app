// web/components/builder/BuilderContactDetails.tsx

import BlurUnlock from "@/components/ui/BlurUnlock";
import SkeletonLine from "./SkeletonLine";

type Props = {
  user: any;
  phones: string[];
  emails?: string[];
};

function ContactRow({
  label,
  value,
  render,
  testId,
}: {
  label: string;
  value?: string | null;
  render?: (v: string) => React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5" data-testid={testId}>
      <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{label}</span>
      <div className="text-base font-semibold text-zinc-700">
        {value ? (
          render ? render(value) : value
        ) : (
          <span className="text-zinc-300 font-normal">Not provided</span>
        )}
      </div>
    </div>
  );
}

export default function BuilderContactDetails({ user, phones, emails = [] }: Props) {
  const primaryPhone = phones[0] ?? null;
  const primaryEmail = emails[0] ?? null;

  return (
    <aside
      className="bg-white rounded-2xl sm:rounded-3xl shadow-sm p-4 sm:p-7 h-fit"
      aria-label="Contact details"
      data-testid="contact-details-card"
    >
      <h2 className="text-base sm:text-lg font-black text-zinc-900 mb-3 sm:mb-5">
        Profile details
      </h2>

      {user ? (
        <div className="space-y-4 sm:space-y-6">
          <section data-testid="builder-contact-details-section">
            <h3 className="hidden sm:block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
              Contact details
            </h3>
            <div className="space-y-3 sm:space-y-4">
              <ContactRow
                label="Phone"
                value={primaryPhone}
                testId="builder-phone"
                render={(v) => (
                  <a href={`tel:${v}`} className="text-red-500 hover:underline font-semibold break-all">
                    {v}
                  </a>
                )}
              />
              <ContactRow
                label="Email"
                value={primaryEmail}
                testId="builder-email"
                render={(v) => (
                  <a href={`mailto:${v}`} className="text-red-500 break-all hover:underline font-semibold">
                    {v}
                  </a>
                )}
              />
            </div>
          </section>
        </div>
      ) : (
        <BlurUnlock previewCount={0} label="contact details">
          <div className="space-y-4" aria-hidden>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Phone</div>
              <SkeletonLine className="mt-1 h-4 w-32" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Email</div>
              <SkeletonLine className="mt-1 h-4 w-40" />
            </div>
          </div>
        </BlurUnlock>
      )}
    </aside>
  );
}
