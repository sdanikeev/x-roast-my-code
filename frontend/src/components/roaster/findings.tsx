"use client";

import { useT } from "@/components/i18n/i18n-provider";
import { SeverityTag } from "@/components/ui";
import type { RoastResult } from "@/lib/roast";

export function Findings({ result }: { result: RoastResult }) {
  const t = useT();
  return (
    <>
      {result.findings.map((f, i) => (
        <div key={i} className="flex flex-col gap-1">
          <SeverityTag severity={f.sev} line={f.line} />
          <div className="whitespace-pre-line">{f.text}</div>
        </div>
      ))}
      <div className="flex flex-col gap-1 border-t border-dashed border-line pt-4">
        <div className="font-bold text-warn">{t("roaster.verdict", { score: result.score })}</div>
        <div>{result.verdict}</div>
      </div>
    </>
  );
}
