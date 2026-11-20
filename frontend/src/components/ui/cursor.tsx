import { cn } from "@/lib/cn";

export function Cursor({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("cursor bg-accent ml-1.5", className)} />;
}
