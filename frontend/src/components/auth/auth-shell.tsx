import type { ReactNode } from "react";
import { Cursor, Eyebrow, Heading, Logo, Page, TextLink } from "@/components/ui";

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
    <Page width="narrow">
      <Logo />
      <div className="flex flex-col gap-2">
        <Eyebrow>{eyebrow}</Eyebrow>
        <Heading>
          {title}
          <Cursor />
        </Heading>
      </div>
      {children}
      <p className="text-caption text-dim">
        {footer.text} <TextLink href={footer.href}>{footer.link}</TextLink>
      </p>
    </Page>
  );
}
