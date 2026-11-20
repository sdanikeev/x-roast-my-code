import { ButtonLink, Cursor, Eyebrow, Heading, Page, PageHeader, TextLink } from "@/components/ui";
import { Tr } from "@/components/i18n/i18n-provider";

export default function Home() {
  return (
    <Page className="flex-1 gap-7">
      <PageHeader>
        <nav className="flex gap-7">
          <TextLink tone="muted" href="/login"><Tr id="nav.login" /></TextLink>
          <TextLink tone="muted" href="/register"><Tr id="nav.register" /></TextLink>
        </nav>
      </PageHeader>
      <div className="mt-20 flex flex-col gap-7">
        <Eyebrow><Tr id="home.eyebrow" /></Eyebrow>
        <Heading size="display">
          <Tr id="home.title1" />
          <br />
          <span className="text-accent">
            <Tr id="home.title2" />
            <Cursor />
          </span>
        </Heading>
        <span className="text-caption text-muted"><Tr id="home.lead" /></span>
        <ButtonLink href="/roaster" className="self-start">
          <Tr id="home.cta" />
        </ButtonLink>
      </div>
    </Page>
  );
}
