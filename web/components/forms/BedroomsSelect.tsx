import * as React from "react";
import Select from "@/components/forms/Select";

type Props = {
  id?: string;
  value: number | string;
  onChange: (next: number) => void;
  className?: string;
  "data-testid"?: string;
  label?: string;
};

const OPTIONS: string[] = ["0", "1", "2", "3", "4", "5", "6+"];

export default function BedroomsSelect({
  id,
  value,
  onChange,
  className,
  "data-testid": testId,
  label, // optional
}: Props) {
  const current = String(value ?? "");

  return (
    <Select
      id={id}
      label={label}
      value={current}
      onChange={(v) => {
        // Map "6+" to 6, otherwise parseInt
        const n = v.endsWith("+") ? parseInt(v, 10) : parseInt(v, 10);
        onChange(Number.isFinite(n) ? n : 0);
      }}
      options={OPTIONS} // your Select supports string[] directly
      placeholder="Select bedrooms"
      className={className}
      data-testid={testId}
      ariaLabel={!label ? "Bedrooms" : undefined}
    />
  );
}
