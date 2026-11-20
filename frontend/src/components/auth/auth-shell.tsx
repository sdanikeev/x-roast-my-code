import type { ReactNode } from "react";
import { Cursor, Eyebrow, Heading, Logo, Page, TextLink } from "@/components/ui";
import { LocaleSwitch } from "@/components/i18n/locale-switch";
import { Tr } from "@/components/i18n/i18n-provider";
import type { MessageKey } from "@/lib/i18n/messages";

export function AuthShell({
  eyebrow,
  title,
  children,
  footer,
}: {
  eyebrow: MessageKey;
  title: MessageKey;
  children: ReactNode;
  footer: { text: MessageKey; href: string; link: MessageKey };
}) {
  return (
    <Page width="narrow">
      <div className="flex items-center justify-between gap-4">
        <Logo />
        <LocaleSwitch />
      </div>
      <div className="flex flex-col gap-2">
        <Eyebrow><Tr id={eyebrow} /></Eyebrow>
        <Heading>
          <Tr id={title} />
          <Cursor />
        </Heading>
      </div>
      {children}
      <p className="text-caption text-dim">
        <Tr id={footer.text} /> <TextLink href={footer.href}><Tr id={footer.link} /></TextLink>
      </p>
    </Page>
  );
}
