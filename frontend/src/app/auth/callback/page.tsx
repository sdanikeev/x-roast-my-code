"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loading, Page, TextLink } from "@/components/ui";
import { useT } from "@/components/i18n/i18n-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { session } from "@/lib/api";

/** GitHub lands here after the backend set the refresh cookie; AuthProvider's refresh picks the session up. */
export default function OAuthCallbackPage() {
  const { status } = useAuth();
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    if (status === "authed") router.replace("/roaster");
  }, [status, router]);

  if (status === "anon") {
    return (
      <Page width="narrow" className="gap-4 py-0 text-sm">
        <h1 className="text-xl font-bold text-crit">{t("callback.title")}</h1>
        <p className="text-muted">{t("callback.body")}</p>
        <pre className="overflow-x-auto rounded-sm border border-line bg-surface p-3 text-code whitespace-pre-wrap">
          {session.lastRefreshError ?? t("callback.noCookie")}
        </pre>
        <TextLink href="/login">{t("callback.back")}</TextLink>
      </Page>
    );
  }

  return (
    <Page width="narrow" className="items-center py-0">
      <Loading>{t("callback.signingIn")}</Loading>
    </Page>
  );
}
