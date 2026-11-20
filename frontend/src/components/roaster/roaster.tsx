"use client";

import { useMemo, useState } from "react";
import { Button, Eyebrow, Heading, Loading, Panel, Segmented } from "@/components/ui";
import { useI18n } from "@/components/i18n/i18n-provider";
import type { MessageKey } from "@/lib/i18n/messages";
import { roast, roastErrorKey, TOXICITY, type RoastResult, type Toxicity } from "@/lib/roast";
import { CodePane } from "./code-pane";
import { Findings } from "./findings";

export function Roaster() {
  const [filename, setFilename] = useState("snippet.js");
  const [code, setCode] = useState("");
  const [toxicity, setToxicity] = useState<Toxicity>("medium");
  const { locale: language, t } = useI18n(); // the interface language is also the language of the roast
  const [result, setResult] = useState<RoastResult>();
  const [error, setError] = useState<MessageKey>();
  const [pending, setPending] = useState(false);

  const flagged = useMemo(() => new Set(result?.findings.map((f) => f.line)), [result]);

  async function run() {
    setPending(true);
    setError(undefined);
    const res = await roast({ code, filename, toxicity, language });
    setPending(false);
    if (res.ok) setResult(res.data as RoastResult);
    else setError(roastErrorKey(res.error));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>{t("roaster.eyebrow")}</Eyebrow>
          <Heading className="mt-1">{t("roaster.title")}</Heading>
        </div>
        <Segmented
          label={t("roaster.toxicity")}
          options={TOXICITY}
          value={toxicity}
          onChange={setToxicity}
          format={(o) => t(`roaster.tox.${o}`)}
        />
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-4 py-2">
          <label htmlFor="filename" className="text-caption text-muted">
            {t("roaster.file")}
          </label>
          <input
            id="filename"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="min-h-touch flex-1 border-0 bg-transparent text-accent"
          />
        </div>
        <div className="flex flex-wrap">
          <div className="min-w-0 flex-[1_1_420px] border-r border-line-soft">
            {result ? (
              <CodePane code={code} flagged={flagged} />
            ) : (
              <textarea
                aria-label={t("roaster.codeLabel")}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                spellCheck={false}
                placeholder={t("roaster.codePlaceholder")}
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
                  {t("roaster.edit")}
                </Button>
              </>
            ) : (
              <>
                <Loading>{t("roaster.waiting")}</Loading>
                {error && <div className="text-crit">{t(error)}</div>}
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={run}
                  disabled={pending || !code.trim()}
                >
                  {pending ? t("roaster.running") : t("roaster.run")}
                </Button>
              </>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
