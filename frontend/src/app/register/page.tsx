import { GithubButton } from "@/components/auth/github-button";
import { OrDivider } from "@/components/auth/or-divider";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow="// toxic to the code. never to you."
      title="Pick your victim."
      footer={{ text: "already registered?", href: "/login", link: "log in" }}
    >
      <GithubButton />
      <OrDivider />
      <RegisterForm />
    </AuthShell>
  );
}
