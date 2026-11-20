import { ButtonLink, Cursor, Eyebrow, Heading, Page, PageHeader, TextLink } from "@/components/ui";

export default function Home() {
  return (
    <Page className="flex-1 gap-7">
      <PageHeader>
        <nav className="flex gap-7">
          <TextLink tone="muted" href="/login">login</TextLink>
          <TextLink tone="muted" href="/register">register</TextLink>
        </nav>
      </PageHeader>
      <div className="mt-20 flex flex-col gap-7">
        <Eyebrow>{"// ai code review. no mercy. no sugar."}</Eyebrow>
        <Heading size="display">
          Your code is bad.
          <br />
          <span className="text-accent">
            We&apos;ll explain why.
            <Cursor />
          </span>
        </Heading>
        <span className="text-caption text-muted">
          An AI reviewer with no patience and no filter. Paste your code, take the hit, fix the bugs it found. Brutal about the code, useful about the fix.
        </span>
        <ButtonLink href="/roaster" className="self-start">
          ./roast your_code →
        </ButtonLink>
      </div>
    </Page>
  );
}
