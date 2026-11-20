"use client";

import { Button } from "./button";

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  format = (o) => o,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-caption text-muted">{label}</span>
      {options.map((o) => (
        <Button
          key={o}
          type="button"
          size="sm"
          variant={o === value ? "primary" : "ghost"}
          aria-pressed={o === value}
          onClick={() => onChange(o)}
        >
          {format(o)}
        </Button>
      ))}
    </div>
  );
}
