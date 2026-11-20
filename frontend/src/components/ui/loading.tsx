import { cn } from "@/lib/cn";
import { Cursor } from "./cursor";

export function Loading({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("text-muted", className)}>
      {children}
      <Cursor className="bg-muted" />
    </div>
  );
}
