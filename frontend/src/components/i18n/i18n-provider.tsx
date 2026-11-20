"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { readLocale, setLocale, subscribeLocale } from "@/lib/i18n/locale";
import { DEFAULT_LOCALE, MESSAGES, type Locale, type MessageKey } from "@/lib/i18n/messages";

type Params = Record<string, string | number>;
type Ctx = { locale: Locale; setLocale: (l: Locale) => void; t: (key: MessageKey, params?: Params) => string };

const translate = (locale: Locale) => (key: MessageKey, params?: Params) => {
  const text = MESSAGES[locale][key] ?? MESSAGES[DEFAULT_LOCALE][key];
  return params ? text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : text;
};

// Without a provider (isolated component tests) everything simply renders in the default language.
const I18nContext = createContext<Ctx>({ locale: DEFAULT_LOCALE, setLocale, t: translate(DEFAULT_LOCALE) });

export function I18nProvider({ children }: { children: ReactNode }) {
  // the server snapshot is the default locale, so hydration matches; the client then switches to the saved one
  const locale = useSyncExternalStore(subscribeLocale, readLocale, () => DEFAULT_LOCALE);
  const value = useMemo(() => ({ locale, setLocale, t: translate(locale) }), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useT = () => useContext(I18nContext).t;

/** Translated text for server components (which cannot call hooks). */
export function Tr({ id, params }: { id: MessageKey; params?: Params }) {
  return <>{useT()(id, params)}</>;
}
