import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { LocaleSwitch } from "@/components/i18n/locale-switch";
import { Logo } from "./logo";

export function PageHeader({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-4", className)}>
      <Logo />
      <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
        {children}
        <LocaleSwitch />
      </div>
    </div>
  );
}
