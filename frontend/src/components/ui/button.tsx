import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "outline" | "secondary" | "ghost";

export type ButtonSize = "md" | "sm";

const base =
  "inline-flex min-h-touch items-center justify-center gap-2 rounded-sm border cursor-pointer " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const sizes: Record<ButtonSize, string> = {
  md: "px-6 py-3 text-body",
  sm: "px-3.5 py-2 text-sm",
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-bg border-accent font-bold hover:brightness-110",
  outline: "bg-transparent text-accent border-accent font-bold hover:bg-accent/10",
  secondary: "bg-transparent text-fg border-line hover:border-accent",
  ghost: "bg-transparent text-muted border-line hover:text-fg",
};

/** Single source of truth for button looks: used by <Button> and <ButtonLink>. */
export const buttonStyles = (
  variant: ButtonVariant = "primary",
  className?: string,
  size: ButtonSize = "md",
) => cn(base, sizes[size], variants[variant], className);

export function Button({
  variant,
  size,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button {...props} className={buttonStyles(variant, className, size)} />;
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** plain <a> (full-page navigation) instead of client-side next/link */
  external?: boolean;
};

export function ButtonLink({ variant, size, className, external, ...props }: ButtonLinkProps) {
  const cls = buttonStyles(variant, className, size);
  return external ? <a {...props} className={cls} /> : <Link {...props} className={cls} />;
}
