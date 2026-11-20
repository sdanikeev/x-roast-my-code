"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Form } from "@/components/ui";
import { login } from "@/lib/auth";
import { useT } from "@/components/i18n/i18n-provider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useAuth } from "./auth-provider";

const OAUTH_ERRORS: Record<string, MessageKey> = {
  github: "error.github",
  oauth_state: "error.oauth_state",
  github_email: "error.github_email",
  github_conflict: "error.github_conflict",
};

export function LoginForm() {
  const router = useRouter();
  const { setUser } = useAuth();
  const t = useT();
  const [error, setError] = useState<MessageKey>();
  const [pending, setPending] = useState(false);

  // ?error=... set by the OAuth callback redirect; server snapshot is null so hydration matches
  const redirectError = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("error"),
    () => null,
  );
  const shownError = error ?? (redirectError ? OAUTH_ERRORS[redirectError] ?? OAUTH_ERRORS.github : undefined);
  const errorText = shownError && t(shownError);

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
    else setError("error.login");
  }

  return (
    <Form onSubmit={onSubmit}>
      <Field label={t("auth.email")} name="email" type="email" autoComplete="email" required placeholder="you@dev.sh" />
      <Field
        label={t("auth.password")}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={errorText}
      />
      <Button type="submit" disabled={pending}>
        {pending ? t("auth.loginPending") : t("auth.loginSubmit")}
      </Button>
    </Form>
  );
}
