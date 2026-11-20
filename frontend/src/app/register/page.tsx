import { GithubButton } from "@/components/auth/github-button";
import { OrDivider } from "@/components/auth/or-divider";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow="register.eyebrow"
      title="register.title"
      footer={{ text: "register.footerText", href: "/login", link: "register.footerLink" }}
    >
      <GithubButton />
      <OrDivider />
      <RegisterForm />
    </AuthShell>
  );
}
