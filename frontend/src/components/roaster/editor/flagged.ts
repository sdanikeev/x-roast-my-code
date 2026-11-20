import { type Extension, type Text, RangeSet, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, GutterMarker, gutterLineClass } from "@codemirror/view";

class FlagMarker extends GutterMarker {
  elementClass = "cm-flagged-gutter";
}
const flagMarker = new FlagMarker();

/** Valid, sorted line numbers (1-based): lines past the end of the document and non-integers are dropped. */
function validLines(doc: Text, lines: Set<number>): number[] {
  return [...lines].filter((n) => Number.isInteger(n) && n >= 1 && n <= doc.lines).sort((a, b) => a - b);
}

/** Line decoration (red background) on every line the analyst flagged. */
export function flaggedDecorations(doc: Text, lines: Set<number>): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const deco = Decoration.line({ class: "cm-flagged" });
  for (const n of validLines(doc, lines)) builder.add(doc.line(n).from, doc.line(n).from, deco);
  return builder.finish();
}

/** Marks the line-number gutter element of the same lines (it turns red). */
export function flaggedMarkers(doc: Text, lines: Set<number>): RangeSet<GutterMarker> {
  const builder = new RangeSetBuilder<GutterMarker>();
  for (const n of validLines(doc, lines)) builder.add(doc.line(n).from, doc.line(n).from, flagMarker);
  return builder.finish();
}

export const setFlagged = StateEffect.define<Set<number>>();

type Flags = { deco: DecorationSet; marks: RangeSet<GutterMarker> };

const flaggedField = StateField.define<Flags>({
  create: () => ({ deco: Decoration.none, marks: RangeSet.empty }),
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setFlagged)) {
        return { deco: flaggedDecorations(tr.state.doc, e.value), marks: flaggedMarkers(tr.state.doc, e.value) };
      }
    }
    return tr.docChanged ? { deco: value.deco.map(tr.changes), marks: value.marks.map(tr.changes) } : value;
  },
  provide: (f) => [EditorView.decorations.from(f, (v) => v.deco), gutterLineClass.from(f, (v) => v.marks)],
});

/** Briefly flashes one line (used when a finding is clicked); `null` clears it. The animation lives in globals.css. */
export const flashLine = StateEffect.define<number | null>();

const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(flashLine)) {
        const n = e.value;
        if (n === null || n < 1 || n > tr.state.doc.lines) return Decoration.none;
        return Decoration.set([Decoration.line({ class: "cm-flash" }).range(tr.state.doc.line(n).from)]);
      }
    }
    return tr.docChanged ? deco.map(tr.changes) : deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const flaggedLines: Extension = [flaggedField, flashField];
