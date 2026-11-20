import { cn } from "@/lib/cn";

export function CodePane({ code, flagged }: { code: string; flagged: Set<number> }) {
  const lines = code.split("\n");
  return (
    <div className="overflow-x-auto py-5" aria-label="code under review">
      {lines.map((text, i) => (
        <div
          key={i}
          className={cn(
            "flex min-w-max gap-4 pr-5 pl-3",
            flagged.has(i + 1) && "bg-crit/15 shadow-[inset_2px_0_0_var(--color-crit)]",
          )}
        >
          <span className="w-7 flex-none text-right text-dim select-none">{i + 1}</span>
          <span className="whitespace-pre text-code">{text}</span>
        </div>
      ))}
    </div>
  );
}
