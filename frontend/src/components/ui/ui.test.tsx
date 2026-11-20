import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button, Field, Segmented, SeverityTag } from ".";

describe("Button", () => {
  it("fires onClick and respects disabled", async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>go</Button>);
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} disabled>
        go
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Field", () => {
  it("links the label to the input", () => {
    render(<Field label="email" name="email" />);
    expect(screen.getByLabelText("email")).toHaveAttribute("name", "email");
  });

  it("exposes the error accessibly", () => {
    render(<Field label="password" error="too short" />);
    const input = screen.getByLabelText("password");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("too short");
  });

  it("has no aria-invalid without an error", () => {
    render(<Field label="x" />);
    expect(screen.getByLabelText("x")).not.toHaveAttribute("aria-invalid");
  });
});

describe("SeverityTag", () => {
  it("renders severity and line", () => {
    render(<SeverityTag severity="CRIT" line={4} />);
    expect(screen.getByText("[CRIT] line 4")).toHaveClass("text-crit");
  });

  it("uses the warning colour for WARN", () => {
    render(<SeverityTag severity="WARN" line={1} />);
    expect(screen.getByText("[WARN] line 1")).toHaveClass("text-warn");
  });
});

describe("Segmented", () => {
  it("marks the selected option and reports changes", async () => {
    const onChange = vi.fn();
    render(<Segmented label="toxicity" options={["mild", "medium", "nuclear"] as const} value="medium" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "medium" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "mild" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "nuclear" }));
    expect(onChange).toHaveBeenCalledWith("nuclear");
  });
});
