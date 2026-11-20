"use client";

import { useMemo, useRef, useState } from "react";
import { Button, Eyebrow, Heading, Loading, Panel, Segmented } from "@/components/ui";
import { useI18n } from "@/components/i18n/i18n-provider";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/cn";
import {
  applyLive,
  emptyLive,
  liveAsResult,
  MAX_CODE_CHARS,
  roastErrorKey,
  roastStream,
  TOXICITY,
  type RoastResult,
  type Toxicity,
} from "@/lib/roast";
import { CodeEditor } from "./code-editor";
import { detectExtension } from "./editor/detect";
import { Findings } from "./findings";

export function Roaster() {
  const [filename, setFilename] = useState("snippet.js");
  const [filenameTouched, setFilenameTouched] = useState(false); // once the user types a name, we stop guessing it
  const [code, setCode] = useState("");
  const [reveal, setReveal] = useState<{ line: number }>(); // a clicked finding: the editor scrolls to its line
  const tooLong = code.length > MAX_CODE_CHARS;
  const [toxicity, setToxicity] = useState<Toxicity>("medium");
  const { locale: language, t } = useI18n(); // the interface language is also the language of the roast
  const [result, setResult] = useState<RoastResult>();
  const [error, setError] = useState<MessageKey>();
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState<"analyzing" | "roasting">();
  const [live, setLive] = useState(emptyLive); // flagged lines and the roast text as it is being written
  const abort = useRef<AbortController>(undefined);

  const streaming = pending && live.facts.length > 0;
  // highlight lines only while a roast is shown or streaming; when editing again the old marks would be stale
  const flagged = useMemo(
    () => new Set((result ? result.findings : streaming ? live.facts : []).map((f) => f.line)),
    [result, streaming, live.facts],
  );
  const liveResult = useMemo(() => liveAsResult(live), [live]);

  async function run() {
    abort.current?.abort();
    const ctrl = (abort.current = new AbortController());
    setPending(true);
    setError(undefined);
    setStage(undefined);
    setLive(emptyLive());
    try {
      for await (const ev of roastStream({ code, filename, toxicity, language }, ctrl.signal)) {
        if (ev.type === "result") setResult(ev.result);
        else {
          if (ev.type === "stage") setStage(ev.stage);
          setLive((l) => applyLive(l, ev));
        }
      }
    } catch (e) {
      if (!ctrl.signal.aborted) setError(roastErrorKey(e));
    } finally {
      if (abort.current === ctrl) {
        setPending(false);
        setStage(undefined);
      }
    }
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
            onChange={(e) => {
              setFilename(e.target.value);
              setFilenameTouched(true);
            }}
            className="min-h-touch flex-1 border-0 bg-transparent text-accent"
          />
        </div>
        <div className="flex flex-wrap">
          <div className="min-w-0 flex-[1_1_420px] border-r border-line-soft">
            <CodeEditor
              value={code}
              onChange={setCode}
              filename={filename}
              flagged={flagged}
              readOnly={Boolean(result || streaming)}
              label={t(result || streaming ? "roaster.codeUnderReview" : "roaster.codeLabel")}
              placeholder={t("roaster.codePlaceholder")}
              reveal={reveal}
              onPaste={(text) => {
                const ext = filenameTouched ? null : detectExtension(text);
                if (ext) setFilename(`snippet.${ext}`);
              }}
            />
            <div
              aria-live="polite"
              className={cn("border-t border-line-soft px-5 py-2 text-caption", tooLong ? "text-crit" : "text-dim")}
            >
              {tooLong ? t("roaster.tooLong", { max: MAX_CODE_CHARS }) : t("roaster.chars", { n: code.length, max: MAX_CODE_CHARS })}
            </div>
          </div>
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-4 p-5">
            <div className="wrap-anywhere text-accent">
              $ roast {filename} --toxicity={toxicity} --lang={language}
            </div>
            {(result || streaming) && <Findings result={result ?? liveResult} animate onSelect={(line) => setReveal({ line })} />}
            {result ? (
              <Button variant="ghost" className="self-start" onClick={() => setResult(undefined)}>
                {t("roaster.edit")}
              </Button>
            ) : (
              <>
                <Loading>{stage ? t(`roaster.stage.${stage}`) : t("roaster.waiting")}</Loading>
                {error && <div className="text-crit">{t(error)}</div>}
                <Button variant="outline" className="self-start" onClick={run} disabled={pending || !code.trim() || tooLong}>
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
