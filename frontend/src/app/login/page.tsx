import { GithubButton } from "@/components/auth/github-button";
import { OrDivider } from "@/components/auth/or-divider";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="// welcome back. your code missed you."
      title="Log in."
      footer={{ text: "no account yet?", href: "/register", link: "register" }}
    >
      <GithubButton />
      <OrDivider />
      <LoginForm />
    </AuthShell>
  );
}
