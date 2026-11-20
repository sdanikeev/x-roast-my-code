import { DEFAULT_LOCALE, LOCALES, type Locale } from "./messages";

const COOKIE = "locale";
const listeners = new Set<() => void>();

const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);

/** Saved choice (cookie) wins; otherwise the browser language; otherwise English. */
export function readLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const saved = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`))?.[1];
  if (isLocale(saved)) return saved;
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of preferred) {
    const lang = tag.toLowerCase().split("-")[0];
    if (isLocale(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}

export function setLocale(locale: Locale) {
  document.cookie = `${COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  listeners.forEach((l) => l());
}

export function subscribeLocale(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
