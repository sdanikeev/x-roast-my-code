import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn("overflow-hidden rounded-md border border-line bg-surface", className)}
    />
  );
}
