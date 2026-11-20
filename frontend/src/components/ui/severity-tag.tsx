import { cn } from "@/lib/cn";

export type Severity = "CRIT" | "WARN";

export function SeverityTag({ severity, line }: { severity: Severity; line: number }) {
  return (
    <span className={cn("text-xs font-bold", severity === "CRIT" ? "text-crit" : "text-warn")}>
      [{severity}] line {line}
    </span>
  );
}
