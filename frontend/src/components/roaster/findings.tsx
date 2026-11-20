import { SeverityTag } from "@/components/ui";
import type { RoastResult } from "@/lib/roast";

export function Findings({ result }: { result: RoastResult }) {
  return (
    <>
      {result.findings.map((f, i) => (
        <div key={i} className="flex flex-col gap-1">
          <SeverityTag severity={f.sev} line={f.line} />
          <div className="whitespace-pre-line">{f.text}</div>
        </div>
      ))}
      <div className="flex flex-col gap-1 border-t border-dashed border-line pt-4">
        <div className="font-bold text-warn">verdict: {result.score}</div>
        <div>{result.verdict}</div>
      </div>
    </>
  );
}
