import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

// Colours come from the roast.sh tokens in globals.css (--color-*), so the editor follows the design system.
export const editorTheme = EditorView.theme(
  {
    "&": { color: "var(--color-code)", backgroundColor: "transparent", minHeight: "18rem", fontSize: "var(--text-body)" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "var(--text-body--line-height)" },
    ".cm-content": { caretColor: "var(--color-accent)", padding: "1.25rem 0" },
    ".cm-line": { padding: "0 1.25rem 0 0.75rem" },
    ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "var(--color-dim)" },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 0.75rem 0 0", minWidth: "2.5rem", textAlign: "right" },
    ".cm-flagged-gutter": { color: "var(--color-crit)", fontWeight: "bold" },
    ".cm-foldGutter .cm-gutterElement": { padding: "0 0.25rem", cursor: "pointer", color: "var(--color-dim)" },
    ".cm-foldGutter .cm-gutterElement:hover": { color: "var(--color-accent)" },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--color-surface-2)",
      border: "1px solid var(--color-line)",
      color: "var(--color-muted)",
      padding: "0 0.4em",
      margin: "0 0.2em",
    },
    // autocomplete popup
    ".cm-tooltip": { backgroundColor: "var(--color-surface-2)", border: "1px solid var(--color-line)", color: "var(--color-fg)" },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-mono)" },
    ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "rgb(124 255 138 / 0.18)", color: "var(--color-fg)" },
    ".cm-completionMatchedText": { color: "var(--color-accent)", textDecoration: "none", fontWeight: "bold" },
    ".cm-completionDetail": { color: "var(--color-dim)" },
    // search panel (Ctrl/Cmd+F)
    ".cm-panels": { backgroundColor: "var(--color-surface-2)", color: "var(--color-fg)" },
    ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--color-line)" },
    ".cm-search label": { color: "var(--color-muted)", fontSize: "var(--text-caption)" },
    ".cm-textfield": {
      backgroundColor: "var(--color-bg)",
      color: "var(--color-fg)",
      border: "1px solid var(--color-line)",
      borderRadius: "var(--radius-sm)",
      padding: "0 0.5rem",
      minHeight: "var(--spacing-touch)",
    },
    ".cm-button": {
      backgroundImage: "none",
      backgroundColor: "var(--color-surface)",
      color: "var(--color-fg)",
      border: "1px solid var(--color-line)",
      borderRadius: "var(--radius-sm)",
      padding: "0 0.75rem",
      minHeight: "var(--spacing-touch)",
    },
    ".cm-searchMatch": { backgroundColor: "rgb(255 209 102 / 0.2)" },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "rgb(255 209 102 / 0.45)" },
    ".cm-selectionMatch": { backgroundColor: "rgb(124 255 138 / 0.12)" },
    ".cm-activeLine": { backgroundColor: "rgb(124 255 138 / 0.04)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--color-muted)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "rgb(124 255 138 / 0.18)" },
    ".cm-cursor": { borderLeftColor: "var(--color-accent)" },
    ".cm-placeholder": { color: "var(--color-dim)" },
    ".cm-matchingBracket": { color: "var(--color-accent)", backgroundColor: "rgb(124 255 138 / 0.12)" },
    // lines flagged by the analyst: same look as before the editor existed
    ".cm-flagged": { backgroundColor: "rgb(255 107 94 / 0.15)", boxShadow: "inset 2px 0 0 var(--color-crit)" },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword, t.definitionKeyword], color: "var(--color-accent)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--color-warn)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--color-syn-num)" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "var(--color-dim)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: "var(--color-syn-fn)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--color-syn-type)" },
  { tag: [t.meta, t.processingInstruction, t.macroName, t.labelName], color: "var(--color-muted)" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "var(--color-muted)" },
]);

export const syntaxTheme = syntaxHighlighting(highlight);
