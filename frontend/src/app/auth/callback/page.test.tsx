import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

import { AuthProvider } from "@/components/auth/auth-provider";
import { session } from "@/lib/api";
import OAuthCallbackPage from "./page";

const user = { id: "1", email: "a@b.dev", name: "A", avatarUrl: null };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("/auth/callback", () => {
  const fetchMock = vi.fn<(...a: unknown[]) => Promise<Response>>();
  beforeEach(() => {
    replace.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    session.token = undefined;
    session.gen = 0;
  });

  const mount = () =>
    render(
      <StrictMode>
        <AuthProvider>
          <OAuthCallbackPage />
        </AuthProvider>
      </StrictMode>,
    );

  it("goes to /roaster when the refresh cookie is valid", async () => {
    fetchMock.mockResolvedValue(json(200, { accessToken: "t", expiresIn: 900, user }));
    mount();
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith("/roaster");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows why when there is no session", async () => {
    fetchMock.mockResolvedValue(json(401, { message: "no refresh token" }));
    mount();
    expect(await screen.findByText("github sign-in failed")).toBeInTheDocument();
    expect(screen.getByText(/HttpError/)).toBeInTheDocument(); // the reason is shown, not swallowed
    expect(replace).not.toHaveBeenCalled();
  });
});
