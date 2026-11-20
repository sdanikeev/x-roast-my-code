import { useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Field({
  label,
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-caption text-muted">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        {...props}
        className={cn(
          "min-h-touch w-full rounded-sm border bg-surface px-3.5 py-2.5 text-fg placeholder:text-dim",
          error ? "border-crit" : "border-line focus:border-accent",
          className,
        )}
      />
      {error && (
        <p id={`${id}-err`} className="text-caption text-crit">
          {error}
        </p>
      )}
    </div>
  );
}
