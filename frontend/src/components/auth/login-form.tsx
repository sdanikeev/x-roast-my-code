"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Form } from "@/components/ui";
import { login } from "@/lib/auth";
import { useAuth } from "./auth-provider";

const OAUTH_ERRORS: Record<string, string> = {
  github: "github sign-in failed, try again",
  oauth_state: "sign-in was interrupted (state mismatch), try again",
  github_email: "your github account has no verified email: verify one on github and retry",
  github_conflict: "this email is already linked to a different github account",
};

export function LoginForm() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  // ?error=... set by the OAuth callback redirect; server snapshot is null so hydration matches
  const redirectError = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("error"),
    () => null,
  );
  const shownError = error ?? (redirectError ? OAUTH_ERRORS[redirectError] ?? OAUTH_ERRORS.github : undefined);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(undefined);
    const res = await login({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (res.ok) {
      setUser(res.user);
      router.push("/roaster");
    }
    else setError("login failed: check your email and password");
  }

  return (
    <Form onSubmit={onSubmit}>
      <Field label="email" name="email" type="email" autoComplete="email" required placeholder="you@dev.sh" />
      <Field
        label="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={shownError}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "authenticating…" : "./login →"}
      </Button>
    </Form>
  );
}
