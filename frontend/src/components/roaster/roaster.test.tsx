import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodePane } from "./code-pane";
import { Findings } from "./findings";

describe("CodePane", () => {
  it("numbers lines and highlights flagged ones", () => {
    const { container } = render(<CodePane code={"a\nb\nc"} flagged={new Set([2])} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    const rows = container.querySelectorAll("div.flex");
    expect(rows[1].className).toContain("bg-crit/15");
    expect(rows[0].className).not.toContain("bg-crit/15");
  });
});

describe("Findings", () => {
  it("lists findings and the verdict", () => {
    render(
      <Findings
        result={{
          score: "2/10",
          verdict: "Burn it down.",
          findings: [
            { line: 2, sev: "WARN", text: "var is old" },
            { line: 6, sev: "CRIT", text: "always null" },
          ],
        }}
      />,
    );
    expect(screen.getByText("[WARN] line 2")).toBeInTheDocument();
    expect(screen.getByText("always null")).toBeInTheDocument();
    expect(screen.getByText("verdict: 2/10")).toBeInTheDocument();
    expect(screen.getByText("Burn it down.")).toBeInTheDocument();
  });
});

describe("Findings (animate)", () => {
  const base = { score: "…", verdict: "", findings: [{ line: 2, sev: "WARN" as const, text: "" }, { line: 6, sev: "CRIT" as const, text: "" }] };

  it("shows nothing for findings and verdict the model has not started writing", () => {
    render(<Findings animate result={base} />);
    expect(screen.queryByText(/line/)).toBeNull();
    expect(screen.queryByText(/verdict/)).toBeNull();
  });

  it("shows a finding once its text starts, still no verdict", async () => {
    render(<Findings animate result={{ ...base, findings: [{ ...base.findings[0], text: "x" }, base.findings[1]] }} />);
    await waitFor(() => expect(screen.getByText("[WARN] line 2")).toBeInTheDocument());
    expect(screen.queryByText("[CRIT] line 6")).toBeNull();
    expect(screen.queryByText(/verdict/)).toBeNull();
  });

  it("types findings one after another, even when all the text is already there; verdict last", async () => {
    const long = "a".repeat(3000);
    render(
      <Findings
        animate
        result={{ score: "2/10", verdict: "done", findings: [{ ...base.findings[0], text: long }, { ...base.findings[1], text: "second" }] }}
      />,
    );
    await waitFor(() => expect(screen.getByText("[WARN] line 2")).toBeInTheDocument());
    expect(screen.queryByText("[CRIT] line 6")).toBeNull(); // the first one is still being typed
    expect(screen.queryByText(/verdict/)).toBeNull();
    await waitFor(() => expect(screen.getByText("verdict: 2/10")).toBeInTheDocument(), { timeout: 8000 });
    expect(screen.getByText("[CRIT] line 6")).toBeInTheDocument(); // by the time the verdict shows, it came first
  }, 10000);
});
