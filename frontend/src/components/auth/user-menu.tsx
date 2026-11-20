"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useAuth } from "./auth-provider";

export function UserMenu() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  if (!user) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
      <span>{user.name ?? user.email}</span>
      <Button
        variant="ghost"
        className="min-h-11 px-3 py-1.5 text-[13px]"
        onClick={async () => {
          await signOut();
          router.push("/login");
        }}
      >
        logout
      </Button>
      <Button
        variant="ghost"
        className="min-h-11 px-3 py-1.5 text-[13px]"
        onClick={async () => {
          await signOut(true);
          router.push("/login");
        }}
      >
        logout everywhere
      </Button>
    </div>
  );
}
