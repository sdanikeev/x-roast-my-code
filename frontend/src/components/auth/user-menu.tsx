"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useAuth } from "./auth-provider";

export function UserMenu() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  if (!user) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-caption text-muted">
      <span>{user.name ?? user.email}</span>
      <Button
        variant="ghost"
        onClick={async () => {
          await signOut();
          router.push("/login");
        }}
      >
        logout
      </Button>
    </div>
  );
}
