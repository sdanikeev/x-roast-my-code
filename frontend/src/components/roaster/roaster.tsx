"use client";

import { useMemo, useState } from "react";
import { Button, Cursor, Panel, Segmented } from "@/components/ui";
import { LANGUAGES, roast, roastErrorMessage, TOXICITY, type Language, type RoastResult, type Toxicity } from "@/lib/roast";
import { CodePane } from "./code-pane";
import { Findings } from "./findings";

export function Roaster() {
  const [filename, setFilename] = useState("snippet.js");
  const [code, setCode] = useState("");
  const [toxicity, setToxicity] = useState<Toxicity>("medium");
  const [language, setLanguage] = useState<Language>("en");
  const [result, setResult] = useState<RoastResult>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const flagged = useMemo(() => new Set(result?.findings.map((f) => f.line)), [result]);

  async function run() {
    setPending(true);
    setError(undefined);
    const res = await roast({ code, filename, toxicity, language });
    setPending(false);
    if (res.ok) setResult(res.data as RoastResult);
    else setError(roastErrorMessage(res.error));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[13px] text-muted">{"// paste. take the hit. fix it."}</div>
          <h1 className="mt-1 text-3xl font-bold">Pick your victim.</h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Segmented label="toxicity" options={TOXICITY} value={toxicity} onChange={setToxicity} />
          <Segmented label="lang" options={LANGUAGES} value={language} onChange={setLanguage} />
        </div>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-4 py-2">
          <label htmlFor="filename" className="text-[13px] text-muted">
            file
          </label>
          <input
            id="filename"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="min-h-11 flex-1 border-0 bg-transparent text-accent"
          />
        </div>
        <div className="flex flex-wrap">
          <div className="min-w-0 flex-[1_1_420px] border-r border-line-soft">
            {result ? (
              <CodePane code={code} flagged={flagged} />
            ) : (
              <textarea
                aria-label="code to roast"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                spellCheck={false}
                placeholder="// paste your code here"
                className="block min-h-72 w-full resize-y bg-transparent p-5 whitespace-pre text-code placeholder:text-dim"
              />
            )}
          </div>
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-4 p-5">
            <div className="wrap-anywhere text-accent">
              $ roast {filename} --toxicity={toxicity} --lang={language}
            </div>
            {result ? (
              <>
                <Findings result={result} />
                <Button variant="ghost" className="self-start" onClick={() => setResult(undefined)}>
                  edit code
                </Button>
              </>
            ) : (
              <>
                <div className="text-muted">
                  waiting for input
                  <Cursor className="bg-muted" />
                </div>
                {error && <div className="text-crit">{error}</div>}
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={run}
                  disabled={pending || !code.trim()}
                >
                  {pending ? "roasting…" : "./roast"}
                </Button>
              </>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
