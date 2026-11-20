import { Logo } from "@/components/ui";
import { RequireAuth } from "@/components/auth/require-auth";
import { UserMenu } from "@/components/auth/user-menu";
import { Roaster } from "@/components/roaster/roaster";

export default function RoasterPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1040px] flex-col gap-10 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Logo />
        <UserMenu />
      </div>
      <RequireAuth>
        <Roaster />
      </RequireAuth>
    </main>
  );
}
