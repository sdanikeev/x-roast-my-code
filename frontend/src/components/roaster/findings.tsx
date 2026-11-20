"use client";

import { useT } from "@/components/i18n/i18n-provider";
import { SeverityTag } from "@/components/ui";
import type { RoastResult } from "@/lib/roast";
import { useSequentialTyping } from "./typing";

/**
 * With `animate` the roast is typed out strictly in order: finding after finding (a finding shows up when its first
 * character is typed), and the verdict only after the last one. With `onSelect` the finding header becomes a button
 * that takes you to its line in the code.
 */
export function Findings({
  result,
  animate = false,
  onSelect,
}: {
  result: RoastResult;
  animate?: boolean;
  onSelect?: (line: number) => void;
}) {
  const t = useT();
  const texts = [...result.findings.map((f) => f.text), result.verdict];
  const shown = useSequentialTyping(texts, animate);
  const verdictAt = result.findings.length;

  return (
    <>
      {result.findings.map((f, i) =>
        animate && shown[i] === 0 ? null : (
          <div key={i} className="flex flex-col gap-1">
            {onSelect ? (
              <button
                type="button"
                title={t("roaster.jump", { line: f.line })}
                onClick={() => onSelect(f.line)}
                className="-my-2 cursor-pointer self-start py-2 text-left hover:underline"
              >
                <SeverityTag severity={f.sev} line={f.line} />
              </button>
            ) : (
              <SeverityTag severity={f.sev} line={f.line} />
            )}
            <div className="whitespace-pre-line">{f.text.slice(0, shown[i])}</div>
          </div>
        ),
      )}
      {(!animate || shown[verdictAt] > 0) && (
        <div className="flex flex-col gap-1 border-t border-dashed border-line pt-4">
          <div className="font-bold text-warn">{t("roaster.verdict", { score: result.score })}</div>
          <div>{result.verdict.slice(0, shown[verdictAt])}</div>
        </div>
      )}
    </>
  );
}
