import type { Locale } from "@/lib/i18n/messages";

// CodeMirror's own UI strings (search panel, fold gutter); English is the built-in default
const RU: Record<string, string> = {
  Find: "Найти",
  Replace: "Заменить",
  next: "дальше",
  previous: "назад",
  all: "все",
  "match case": "с регистром",
  regexp: "регулярка",
  "by word": "слово целиком",
  replace: "заменить",
  "replace all": "заменить все",
  close: "закрыть",
  "current match": "текущее совпадение",
  "on line": "на строке",
  "Fold line": "Свернуть блок",
  "Unfold line": "Развернуть блок",
  "Folded lines": "Свёрнутые строки",
  "Unfolded lines": "Развёрнутые строки",
  to: "до",
  "folded code": "свёрнутый код",
  unfold: "развернуть",
  "Fold all": "Свернуть всё",
  "Unfold all": "Развернуть всё",
};

export const phrasesFor = (locale: Locale): Record<string, string> => (locale === "ru" ? RU : {});
