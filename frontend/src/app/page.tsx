import Link from "next/link";
import { Cursor, Logo } from "@/components/ui";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col gap-7 px-6 py-6">
      <div className="flex items-center justify-between">
        <Logo />
        <nav className="flex gap-7 text-muted">
          <Link href="/login" className="hover:text-fg">login</Link>
          <Link href="/register" className="hover:text-fg">register</Link>
        </nav>
      </div>
      <div className="mt-20 flex flex-col gap-7">
        <div className="text-[13px] text-muted">{"// ai code review. no mercy. no sugar."}</div>
        <h1 className="text-[clamp(34px,7vw,72px)] leading-[1.05] font-bold tracking-tight">
          Your code is bad.
          <br />
          <span className="text-accent">
            We&apos;ll explain why.
            <Cursor />
          </span>
        </h1>
        <Link
          href="/roaster"
          className="inline-flex min-h-11 items-center self-start rounded-sm bg-accent px-6 py-3.5 font-bold text-bg"
        >
          ./roast your_code →
        </Link>
      </div>
    </main>
  );
}
