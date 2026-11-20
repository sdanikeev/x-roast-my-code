import type { ReactNode } from "react";
import { Logo } from "./logo";

export function PageHeader({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <Logo />
      {children}
    </div>
  );
}
