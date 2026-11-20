import { Page, PageHeader } from "@/components/ui";
import { RequireAuth } from "@/components/auth/require-auth";
import { UserMenu } from "@/components/auth/user-menu";
import { Roaster } from "@/components/roaster/roaster";

export default function RoasterPage() {
  return (
    <Page>
      <PageHeader className="border-b border-line-soft pb-6">
        <UserMenu />
      </PageHeader>
      <RequireAuth>
        <Roaster />
      </RequireAuth>
    </Page>
  );
}
