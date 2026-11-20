import { render, screen } from "@testing-library/react";
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
