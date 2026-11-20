"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n/i18n-provider";
import { useAuth } from "./auth-provider";

export function UserMenu() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const t = useT();
  if (!user) return null;
  const nick = user.name ?? user.email;
  return (
    <div className="flex items-center gap-3 text-caption">
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote GitHub avatar, no image-domain config needed
        <img
          src={user.avatarUrl}
          alt=""
          width={40}
          height={40}
          referrerPolicy="no-referrer"
          className="size-10 shrink-0 rounded-sm border border-line object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-sm border border-line bg-surface-2 font-bold text-accent uppercase"
        >
          {nick.charAt(0)}
        </span>
      )}
      <div className="flex min-w-0 flex-col items-start leading-snug">
        <span className="max-w-[14rem] truncate text-fg">{nick}</span>
        <button
          type="button"
          className="cursor-pointer text-dim hover:text-accent"
          onClick={async () => {
            await signOut();
            router.push("/login");
          }}
        >
          {t("auth.logout")}
        </button>
      </div>
    </div>
  );
}
