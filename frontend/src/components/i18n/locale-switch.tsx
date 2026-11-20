"use client";

import { cn } from "@/lib/cn";
import { LOCALES } from "@/lib/i18n/messages";
import { useI18n } from "./i18n-provider";

export function LocaleSwitch({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div role="group" aria-label={t("locale.label")} className={cn("flex items-center gap-1 text-caption", className)}>
      {LOCALES.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 && (
            <span aria-hidden className="text-line">
              /
            </span>
          )}
          <button
            type="button"
            lang={l}
            aria-pressed={l === locale}
            onClick={() => setLocale(l)}
            className={cn(
              "min-w-6 cursor-pointer px-1 uppercase",
              l === locale ? "font-bold text-accent" : "text-dim hover:text-fg",
            )}
          >
            {l}
          </button>
        </span>
      ))}
    </div>
  );
}
