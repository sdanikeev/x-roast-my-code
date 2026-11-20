"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Cursor } from "@/components/ui";
import { useAuth } from "./auth-provider";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anon") router.replace("/login");
  }, [status, router]);

  if (status !== "authed") {
    return (
      <div className="text-muted">
        authenticating
        <Cursor className="bg-muted" />
      </div>
    );
  }
  return <>{children}</>;
}
