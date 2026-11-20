import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { MESSAGES } from "@/lib/i18n/messages";
import { I18nProvider, Tr } from "./i18n-provider";
import { LocaleSwitch } from "./locale-switch";

const clearCookie = () => (document.cookie = "locale=; path=/; max-age=0");

describe("i18n", () => {
  beforeEach(clearCookie);

  it("has every key translated in every language, with the same placeholders", () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const key of Object.keys(MESSAGES.en) as (keyof typeof MESSAGES.en)[]) {
      expect(MESSAGES.ru[key], key).toBeTruthy();
      expect(placeholders(MESSAGES.ru[key]), key).toBe(placeholders(MESSAGES.en[key]));
    }
  });

  it("renders English by default and switches to Russian, remembering the choice", async () => {
    render(
      <I18nProvider>
        <LocaleSwitch />
        <Tr id="roaster.verdict" params={{ score: "2/10" }} />
      </I18nProvider>,
    );
    expect(screen.getByText("verdict: 2/10")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ru" }));
    expect(screen.getByText("вердикт: 2/10")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("ru");
    expect(document.cookie).toContain("locale=ru");
  });

  it("starts in the saved language", () => {
    document.cookie = "locale=ru; path=/";
    render(
      <I18nProvider>
        <Tr id="nav.login" />
      </I18nProvider>,
    );
    expect(screen.getByText("войти")).toBeInTheDocument();
  });
});
