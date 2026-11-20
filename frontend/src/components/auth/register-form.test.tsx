import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const setUser = vi.fn();
const register = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./auth-provider", () => ({ useAuth: () => ({ setUser }) }));
vi.mock("@/lib/auth", () => ({ register: (...a: unknown[]) => register(...a) }));

import { RegisterForm } from "./register-form";

async function fill(email: string, password: string, confirm: string) {
  await userEvent.type(screen.getByLabelText("email"), email);
  await userEvent.type(screen.getByLabelText("password"), password);
  await userEvent.type(screen.getByLabelText("confirm password"), confirm);
  await userEvent.click(screen.getByRole("button", { name: /register/ }));
}

describe("RegisterForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects short passwords without calling the API", async () => {
    render(<RegisterForm />);
    await fill("a@b.dev", "short", "short");
    expect(screen.getByText("at least 8 characters")).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("rejects mismatching passwords without calling the API", async () => {
    render(<RegisterForm />);
    await fill("a@b.dev", "longenough1", "longenough2");
    expect(screen.getByText("passwords do not match")).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("signs in and navigates on success", async () => {
    register.mockResolvedValue({ ok: true, user: { id: "1", email: "a@b.dev", name: null, avatarUrl: null } });
    render(<RegisterForm />);
    await fill("a@b.dev", "longenough1", "longenough1");
    expect(register).toHaveBeenCalledWith({ email: "a@b.dev", password: "longenough1" });
    expect(setUser).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/roaster");
  });

  it("shows an error when registration fails", async () => {
    register.mockResolvedValue({ ok: false, error: new Error("409") });
    render(<RegisterForm />);
    await fill("a@b.dev", "longenough1", "longenough1");
    expect(await screen.findByText(/registration failed/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
