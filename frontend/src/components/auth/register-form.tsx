"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Form } from "@/components/ui";
import { register } from "@/lib/auth";
import { useAuth } from "./auth-provider";

export function RegisterForm() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [errors, setErrors] = useState<{ password?: string; form?: string }>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password.length < 8) return setErrors({ password: "at least 8 characters" });
    if (password !== String(form.get("confirm")))
      return setErrors({ password: "passwords do not match" });

    setPending(true);
    setErrors({});
    const res = await register({ email: String(form.get("email")), password });
    setPending(false);
    if (res.ok) {
      setUser(res.user);
      router.push("/roaster");
    }
    else setErrors({ form: "registration failed: try another email" });
  }

  return (
    <Form onSubmit={onSubmit}>
      <Field label="email" name="email" type="email" autoComplete="email" required placeholder="you@dev.sh" />
      <Field
        label="password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={errors.password}
      />
      <Field
        label="confirm password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={errors.form}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "creating account…" : "./register →"}
      </Button>
    </Form>
  );
}
