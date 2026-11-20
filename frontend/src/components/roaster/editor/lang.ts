import type { Extension } from "@codemirror/state";
import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";

export type Lang = "javascript" | "jsx" | "typescript" | "tsx" | "python" | "java" | "cpp" | "go";

// a Map, not an object literal: `obj["constructor"]` would hit Object.prototype
const BY_EXTENSION = new Map<string, Lang>([
  ["js", "javascript"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["jsx", "jsx"],
  ["ts", "typescript"],
  ["tsx", "tsx"],
  ["py", "python"],
  ["java", "java"],
  ["c", "cpp"],
  ["h", "cpp"],
  ["cc", "cpp"],
  ["cpp", "cpp"],
  ["cxx", "cpp"],
  ["hh", "cpp"],
  ["hpp", "cpp"],
  ["hxx", "cpp"],
  ["go", "go"],
]);

/** Language for a file name by its extension, or null when we do not highlight it. */
export function langOf(filename: string): Lang | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return null;
  return BY_EXTENSION.get(filename.slice(dot + 1).toLowerCase()) ?? null;
}

export function languageExtension(lang: Lang | null): Extension {
  switch (lang) {
    case "javascript":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "typescript":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "python":
      return python();
    case "java":
      return java();
    case "cpp":
      return cpp();
    case "go":
      return go();
    default:
      return [];
  }
}
