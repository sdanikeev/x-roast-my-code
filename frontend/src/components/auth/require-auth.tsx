"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loading } from "@/components/ui";
import { useT } from "@/components/i18n/i18n-provider";
import { useAuth } from "./auth-provider";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    if (status === "anon") router.replace("/login");
  }, [status, router]);

  if (status !== "authed") {
    return <Loading>{t("auth.authenticating")}</Loading>;
  }
  return <>{children}</>;
}
