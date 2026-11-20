import { GithubButton } from "@/components/auth/github-button";
import { OrDivider } from "@/components/auth/or-divider";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="login.eyebrow"
      title="login.title"
      footer={{ text: "login.footerText", href: "/register", link: "login.footerLink" }}
    >
      <GithubButton />
      <OrDivider />
      <LoginForm />
    </AuthShell>
  );
}
