import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "outline" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-bg border border-accent font-bold hover:brightness-110",
  outline: "bg-transparent text-accent border border-accent font-bold hover:bg-accent/10",
  ghost: "bg-transparent text-muted border border-line hover:text-fg",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-6 py-3 text-[15px] cursor-pointer",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
    />
  );
}
