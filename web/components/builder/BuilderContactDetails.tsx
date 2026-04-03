// web/components/builder/BuilderContactDetails.tsx

import BlurUnlock from "@/components/ui/BlurUnlock";
import SkeletonLine from "./SkeletonLine";

type Props = {
  user: any;
  phones: string[];
};

export default function BuilderContactDetails({ user, phones }: Props) {
  return (
    <section
      className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-6 sm:p-7"
      aria-label="Contact details"
      data-testid="contact-details-card"
    >
      <h2 className="text-lg font-black text-zinc-900 mb-4">
        Profile details
      </h2>

      {user ? (
        <div className="space-y-6 text-sm text-slate-800">
          <section data-testid="builder-contact-details-section">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Contact details
            </h3>

            <div className="space-y-4">
              {/* Phone */}
              <div data-testid="builder-phone">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 block">
                  Phone
                </span>

                {(() => {
                  const uniquePhones = [...new Set(phones)];
                  const primary = uniquePhones[0] || null;
                  const secondary = uniquePhones.slice(1);

                  return (
                    <>
                      {primary ? (
                        <div className="mt-0.5 flex items-center gap-2">
                          <a
                            href={`tel:${primary}`}
                            className="text-sm text-emerald-700 tabular-nums hover:underline"
                          >
                            {primary}
                          </a>
                          <span className="rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5">
                            Primary
                          </span>
                        </div>
                      ) : (
                        <span className="mt-0.5 block text-sm text-slate-400">
                          Not provided
                        </span>
                      )}

                      {secondary.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {secondary.map((p, i) => (
                            <li key={`${p}-${i}`}>
                              <div className="flex items-center gap-2 text-xs">
                                <a
                                  href={`tel:${p}`}
                                  className="text-slate-700 tabular-nums hover:underline"
                                >
                                  {p}
                                </a>
                                <span className="rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5">
                                  Secondary
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </section>
        </div>
      ) : (
        <BlurUnlock previewCount={0} label="contact details">
          <div className="space-y-4" aria-hidden>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Phone
              </div>
              <SkeletonLine className="mt-1 h-4 w-32" />
            </div>
          </div>
        </BlurUnlock>
      )}
    </section>
  );
}
