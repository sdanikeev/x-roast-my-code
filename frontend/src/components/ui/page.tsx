import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const widths = {
  wide: "max-w-page gap-10 py-6",
  narrow: "max-w-narrow flex-1 justify-center gap-8 py-12",
} as const;

/** Page-level <main> wrapper. `wide` = app pages, `narrow` = centered auth-like pages. */
export function Page({
  width = "wide",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { width?: keyof typeof widths }) {
  return (
    <main
      {...props}
      className={cn("mx-auto flex w-full flex-col px-page-x", widths[width], className)}
    />
  );
}
