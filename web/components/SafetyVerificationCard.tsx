import * as React from "react";
import { ShieldCheck, Building2, CheckCircle2 } from "lucide-react";
import AccordionRow from "@/components/AccordionRow";

export default function SafetyVerificationCard() {
  const [expanded, setExpanded] = React.useState(true);

  return (
    <AccordionRow
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      testId="safety-verification-accordion"
      header={
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <ShieldCheck size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">
              Safety &amp; verification on VetMyBuilder
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              We combine official checks with community signals to help you feel
              confident about who you invite to your home.
            </p>
          </div>
        </div>
      }
    >
      <dl className="space-y-2 text-xs text-slate-600">
        <div className="flex gap-2">
          <dt className="mt-0.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Building2 size={14} />
            </span>
          </dt>
          <dd>
            <span className="font-semibold">Companies House checks.</span> Where
            possible, we match tradesmen to a registered company and show when
            that match is verified.
          </dd>
        </div>

        <div className="flex gap-2">
          <dt className="mt-0.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-50 text-red-500">
              <CheckCircle2 size={14} />
            </span>
          </dt>
          <dd>
            <span className="font-semibold">VMB score &amp; badges.</span>{" "}
            Profiles are ranked using signals like photos, completed projects,
            documents and web presence – not just who paid the most.
          </dd>
        </div>

        <div className="flex gap-2">
          <dt className="mt-0.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <span className="text-[10px] font-bold">TIP</span>
            </span>
          </dt>
          <dd>
            Always ask for a written quote, check proof of insurance, and keep
            all messages and agreements in writing.
          </dd>
        </div>
      </dl>
    </AccordionRow>
  );
}
