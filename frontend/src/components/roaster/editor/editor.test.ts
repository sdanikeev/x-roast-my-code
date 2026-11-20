import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { detectExtension } from "./detect";
import { flaggedDecorations, flaggedMarkers } from "./flagged";
import { langOf } from "./lang";

describe("langOf", () => {
  it("maps the supported extensions, case-insensitively", () => {
    expect(langOf("main.py")).toBe("python");
    expect(langOf("Main.JAVA")).toBe("java");
    expect(langOf("util.ts")).toBe("typescript");
    expect(langOf("App.tsx")).toBe("tsx");
    expect(langOf("app.jsx")).toBe("jsx");
    expect(langOf("index.mjs")).toBe("javascript");
    expect(langOf("lib.hpp")).toBe("cpp");
    expect(langOf("main.c")).toBe("cpp");
    expect(langOf("server.go")).toBe("go");
  });

  it("returns null for unknown or missing extensions", () => {
    expect(langOf("notes.txt")).toBeNull();
    expect(langOf("Makefile")).toBeNull();
    expect(langOf("x.constructor")).toBeNull();
    expect(langOf("x.")).toBeNull();
  });
});

describe("flaggedDecorations", () => {
  const doc = Text.of(["a", "bb", "ccc"]);

  it("puts one line decoration at the start of each flagged line", () => {
    const set = flaggedDecorations(doc, new Set([2, 3]));
    const starts: number[] = [];
    set.between(0, doc.length, (from) => {
      starts.push(from);
    });
    expect(starts).toEqual([doc.line(2).from, doc.line(3).from]);
  });

  it("ignores lines that are not in the document", () => {
    const set = flaggedDecorations(doc, new Set([0, 4, 1.5]));
    expect(set.size).toBe(0);
  });
});

describe("flaggedMarkers", () => {
  it("marks the gutter of the same lines and skips invalid ones", () => {
    const doc = Text.of(["a", "bb", "ccc"]);
    const starts: number[] = [];
    flaggedMarkers(doc, new Set([3, 1, 9])).between(0, doc.length, (from) => {
      starts.push(from);
    });
    expect(starts).toEqual([0, doc.line(3).from]);
  });
});

describe("detectExtension", () => {
  const cases: [string, string][] = [
    ["package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"hi\")\n}", "go"],
    ["public class Main {\n  public static void main(String[] args) {\n    System.out.println(1);\n  }\n}", "java"],
    ["#include <iostream>\nint main() {\n  std::cout << 1;\n}", "cpp"],
    ["import os\n\ndef main(x):\n    print(x)\n\nif __name__ == '__main__':\n    main(1)", "py"],
    ["interface User { id: number }\nconst u: User = { id: 1 };", "ts"],
    ["const a = require('a');\nfunction f() { console.log(a) }", "js"],
  ];

  it.each(cases)("recognises %j as .%s", (code, ext) => {
    expect(detectExtension(code)).toBe(ext);
  });

  it("stays silent on weak or empty hints", () => {
    expect(detectExtension("")).toBeNull();
    expect(detectExtension("print(1)")).toBeNull();
    expect(detectExtension("hello world")).toBeNull();
  });
});
