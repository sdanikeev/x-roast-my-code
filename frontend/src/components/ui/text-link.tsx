import type { ComponentProps } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

const tones = {
  accent: "text-accent hover:underline",
  muted: "text-muted hover:text-fg",
} as const;

export function TextLink({
  tone = "accent",
  className,
  ...props
}: ComponentProps<typeof Link> & { tone?: keyof typeof tones }) {
  return <Link {...props} className={cn(tones[tone], className)} />;
}
