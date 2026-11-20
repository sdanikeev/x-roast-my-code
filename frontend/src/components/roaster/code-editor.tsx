"use client";

import { useEffect, useRef, useState } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap, completeAnyWord } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";
import { useI18n } from "@/components/i18n/i18n-provider";
import { editorTheme, syntaxTheme } from "./editor/theme";
import { flaggedLines, flashLine, setFlagged } from "./editor/flagged";
import { languageExtension, langOf } from "./editor/lang";
import { phrasesFor } from "./editor/phrases";

type Props = {
  value: string;
  onChange: (code: string) => void;
  filename: string;
  flagged: Set<number>;
  readOnly: boolean;
  label: string;
  placeholder: string;
  /** Scroll to this line and flash it. Pass a new object each time (clicking the same line twice works too). */
  reveal?: { line: number };
  /** Text the user pasted into the editor (not called while read-only). */
  onPaste?: (text: string) => void;
};

/**
 * CodeMirror 6 editor. The parent owns `value`; the editor only pushes edits up through `onChange`
 * and takes external changes back through the `value` prop. Language, editability, labels and flagged
 * lines are reconfigured in place, so the document and the cursor survive those updates.
 */
export function CodeEditor({ value, onChange, filename, flagged, readOnly, label, placeholder: hint, reveal, onPaste }: Props) {
  const { locale } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onPasteRef = useRef(onPaste);
  useEffect(() => {
    onChangeRef.current = onChange;
    onPasteRef.current = onPaste;
  });
  const [compartments] = useState(() => ({
    language: new Compartment(),
    editable: new Compartment(),
    attrs: new Compartment(),
  }));

  // create the view once; the effects below fill it in
  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: "",
        extensions: [
          lineNumbers(),
          foldGutter(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          history(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          // keywords/snippets come from the language packs; words already in the document work for every language
          autocompletion(),
          EditorState.languageData.of(() => [{ autocomplete: completeAnyWord }]),
          search({ top: true }),
          highlightSelectionMatches(),
          // Tab indents instead of moving focus: standard for code editors, Esc/click leaves the field
          keymap.of([...closeBracketsKeymap, ...searchKeymap, ...foldKeymap, indentWithTab, ...defaultKeymap, ...historyKeymap]),
          syntaxTheme,
          editorTheme,
          flaggedLines,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            paste(event, editor) {
              const text = event.clipboardData?.getData("text/plain");
              if (text && !editor.state.readOnly) onPasteRef.current?.(text);
              return false; // never swallow the paste, only listen
            },
          }),
          compartments.language.of([]),
          compartments.editable.of([]),
          compartments.attrs.of([]),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, [compartments]);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: compartments.language.reconfigure(languageExtension(langOf(filename))) });
  }, [filename, compartments]);

  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.editable.reconfigure([EditorView.editable.of(!readOnly), EditorState.readOnly.of(readOnly)]),
    });
  }, [readOnly, compartments]);

  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.attrs.reconfigure([
        placeholder(hint),
        EditorView.contentAttributes.of({ "aria-label": label }),
        EditorState.phrases.of(phrasesFor(locale)),
      ]),
    });
  }, [hint, label, locale, compartments]);

  useEffect(() => {
    view.current?.dispatch({ effects: setFlagged.of(flagged) });
  }, [flagged]);

  useEffect(() => {
    const v = view.current;
    if (!reveal || !v) return;
    const n = Math.min(Math.max(reveal.line, 1), v.state.doc.lines);
    v.dispatch({ effects: [EditorView.scrollIntoView(v.state.doc.line(n).from, { y: "center" }), flashLine.of(null)] });
    // clear first, then set on the next tick, so the CSS animation restarts when the same line is clicked again
    const start = setTimeout(() => v.dispatch({ effects: flashLine.of(n) }), 30);
    const end = setTimeout(() => v.dispatch({ effects: flashLine.of(null) }), 1400);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
  }, [reveal]);

  return <div ref={host} className="min-w-0" />;
}
