"use client";

import { useT } from "@/components/i18n/i18n-provider";
import { cn } from "@/lib/cn";

export type Severity = "CRIT" | "WARN";

export function SeverityTag({ severity, line }: { severity: Severity; line: number }) {
  const t = useT();
  return (
    <span className={cn("text-xs font-bold", severity === "CRIT" ? "text-crit" : "text-warn")}>
      [{severity}] {t("roaster.line", { line })}
    </span>
  );
}
