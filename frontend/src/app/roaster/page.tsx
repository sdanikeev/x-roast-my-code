import { Page, PageHeader } from "@/components/ui";
import { RequireAuth } from "@/components/auth/require-auth";
import { UserMenu } from "@/components/auth/user-menu";
import { Roaster } from "@/components/roaster/roaster";

export default function RoasterPage() {
  return (
    <Page>
      <PageHeader>
        <UserMenu />
      </PageHeader>
      <RequireAuth>
        <Roaster />
      </RequireAuth>
    </Page>
  );
}
