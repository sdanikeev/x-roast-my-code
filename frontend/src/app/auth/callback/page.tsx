"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Cursor } from "@/components/ui";
import { useAuth } from "@/components/auth/auth-provider";
import { session } from "@/lib/api";

/** GitHub lands here after the backend set the refresh cookie; AuthProvider's refresh picks the session up. */
export default function OAuthCallbackPage() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authed") router.replace("/roaster");
  }, [status, router]);

  if (status === "anon") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6 text-sm">
        <h1 className="text-xl font-bold text-crit">github sign-in failed</h1>
        <p className="text-muted">
          GitHub accepted you, but this browser could not start a session.
        </p>
        <pre className="overflow-x-auto rounded-sm border border-line bg-surface p-3 text-code whitespace-pre-wrap">
          {session.lastRefreshError ?? "no session cookie was accepted"}
        </pre>
        <Link href="/login" className="text-accent hover:underline">
          back to login
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex flex-1 items-center justify-center text-muted">
      signing you in
      <Cursor className="bg-muted" />
    </main>
  );
}
