type Rule = [pattern: RegExp, weight: number];

const JS: Rule[] = [
  [/\b(const|let|var)\s+[\w$]+\s*=/, 2],
  [/\bfunction\s*[\w$]*\s*\(/, 2],
  [/=>/, 1],
  [/\brequire\(/, 2],
  [/\bconsole\.\w+\(/, 2],
  [/^\s*export\s+(default|const|function|class)\b/m, 2],
  [/\bimport\s+[^\n]+\s+from\s+['"]/, 2],
];

// TypeScript is JavaScript plus type syntax, so it also collects the JS rules and wins only when types show up
const TS_ONLY: Rule[] = [
  [/[\w)\]]\s*:\s*(string|number|boolean|void|any|unknown|never)\b/, 3],
  [/^\s*(export\s+)?interface\s+\w+/m, 3],
  [/^\s*(export\s+)?type\s+\w+(<[^>]*>)?\s*=/m, 3],
  [/\bas\s+(const|string|number|unknown|any)\b/, 2],
];

const RULES: { ext: string; rules: Rule[] }[] = [
  {
    ext: "go",
    rules: [
      [/^package\s+\w+\s*$/m, 3],
      [/^func\s+(\([^)]*\)\s*)?\w+\(/m, 3],
      [/^import\s+\(/m, 2],
      [/\bfmt\.\w+\(/, 2],
      [/:=/, 1],
    ],
  },
  {
    ext: "java",
    rules: [
      [/\bpublic\s+(static\s+)?(final\s+)?(class|interface|enum|void)\b/, 3],
      [/System\.out\.print/, 3],
      [/^import\s+javax?\./m, 3],
      [/\bString\[\]\s+args\b/, 2],
      [/@Override\b/, 2],
      [/^package\s+[\w.]+;/m, 2],
    ],
  },
  {
    ext: "cpp",
    rules: [
      [/^\s*#include\s*[<"]/m, 3],
      [/\bstd::/, 3],
      [/\b(cout|cin|cerr)\s*<</, 3],
      [/\busing\s+namespace\b/, 3],
      [/\btemplate\s*</, 2],
      [/\b(int|void)\s+main\s*\(/, 2],
      [/\b(printf|scanf)\s*\(/, 1],
    ],
  },
  {
    ext: "py",
    rules: [
      [/^\s*def\s+\w+\(.*\)\s*(->\s*[^:]+)?:\s*$/m, 3],
      [/^\s*class\s+\w+(\(.*\))?:\s*$/m, 3],
      [/\bif\s+__name__\s*==/, 3],
      [/^\s*(from\s+[\w.]+\s+import\s+|import\s+[\w.]+\s*$)/m, 2],
      [/^\s*(elif\b.*|except\b.*|with\s+.+)\s*:\s*$/m, 2],
      [/\bprint\(/, 1],
      [/\bself\b/, 1],
      [/\b(None|True|False)\b/, 1],
    ],
  },
  { ext: "js", rules: JS },
  { ext: "ts", rules: [...TS_ONLY, ...JS] }, // after js: a tie (no types) stays js
];

const MIN_SCORE = 3; // a single weak hint (a bare `print(`) is not enough to rename the user's file

/** Guesses a file extension from pasted code, or null when it is not clear. Earlier languages win ties. */
export function detectExtension(code: string): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const { ext, rules } of RULES) {
    const score = rules.reduce((sum, [re, weight]) => sum + (re.test(code) ? weight : 0), 0);
    if (score > bestScore) {
      best = ext;
      bestScore = score;
    }
  }
  return bestScore >= MIN_SCORE ? best : null;
}
