"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loading, Page, TextLink } from "@/components/ui";
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
      <Page width="narrow" className="gap-4 py-0 text-sm">
        <h1 className="text-xl font-bold text-crit">github sign-in failed</h1>
        <p className="text-muted">
          GitHub accepted you, but this browser could not start a session.
        </p>
        <pre className="overflow-x-auto rounded-sm border border-line bg-surface p-3 text-code whitespace-pre-wrap">
          {session.lastRefreshError ?? "no session cookie was accepted"}
        </pre>
        <TextLink href="/login">back to login</TextLink>
      </Page>
    );
  }

  return (
    <Page width="narrow" className="items-center py-0">
      <Loading>signing you in</Loading>
    </Page>
  );
}
