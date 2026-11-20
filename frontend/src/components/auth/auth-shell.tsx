import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { Cursor } from "@/components/ui";

export function AuthShell({
  eyebrow,
  title,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  footer: { text: string; href: string; link: string };
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-12">
      <Logo />
      <div className="flex flex-col gap-2">
        <div className="text-[13px] text-muted">{eyebrow}</div>
        <h1 className="text-3xl font-bold leading-tight tracking-tight">
          {title}
          <Cursor />
        </h1>
      </div>
      {children}
      <p className="text-[13px] text-dim">
        {footer.text}{" "}
        <Link href={footer.href} className="text-accent hover:underline">
          {footer.link}
        </Link>
      </p>
    </main>
  );
}
