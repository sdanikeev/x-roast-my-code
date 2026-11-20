import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** `// comment` line above a heading. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-caption text-muted", className)}>{children}</div>;
}

const sizes = { md: "text-3xl leading-tight", display: "text-display" } as const;

export function Heading({
  size = "md",
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { size?: keyof typeof sizes }) {
  return <h1 {...props} className={cn("font-bold tracking-tight", sizes[size], className)} />;
}
