"use client";

import { Button } from "./button";

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
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
          {o}
        </Button>
      ))}
    </div>
  );
}
