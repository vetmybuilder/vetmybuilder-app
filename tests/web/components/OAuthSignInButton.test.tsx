import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Mock the oauthSignIn util before importing the component so the component
// picks up the mocked module.
vi.mock("../../../web/utils/oauthSignIn", () => ({
  signInWithProvider: vi.fn(),
}));

// Hoisted mocks for the homeowner-signup gate dependencies.
const { mockGet, signOutMock } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  signOutMock: vi.fn(),
}));
vi.mock("../../../web/utils/api", () => ({
  useApi: () => ({ get: mockGet }),
}));
vi.mock("../../../web/utils/auth", () => ({
  signOutUser: signOutMock,
}));

import OAuthSignInButton, {
  RETURN_TO_KEY,
  INTENT_KEY,
} from "../../../web/components/forms/OAuthSignInButton";
import { signInWithProvider } from "../../../web/utils/oauthSignIn";

const mockedSignIn = signInWithProvider as unknown as ReturnType<typeof vi.fn>;

describe("<OAuthSignInButton />", () => {
  beforeEach(() => {
    mockedSignIn.mockReset();
    mockGet.mockReset();
    signOutMock.mockReset();
    try {
      sessionStorage.clear();
    } catch {}
  });

  it("calls signInWithProvider('google') when the Google button is clicked", async () => {
    mockedSignIn.mockResolvedValueOnce({
      ok: true,
      credential: { user: { getIdToken: vi.fn().mockResolvedValue("t") } },
    });

    render(<OAuthSignInButton provider="google" />);
    fireEvent.click(screen.getByTestId("google-signin-button"));

    await waitFor(() => expect(mockedSignIn).toHaveBeenCalledWith("google"));
  });

  it("calls signInWithProvider('facebook') when the Facebook button is clicked", async () => {
    mockedSignIn.mockResolvedValueOnce({
      ok: true,
      credential: { user: { getIdToken: vi.fn().mockResolvedValue("t") } },
    });

    render(<OAuthSignInButton provider="facebook" />);
    fireEvent.click(screen.getByTestId("facebook-signin-button"));

    await waitFor(() => expect(mockedSignIn).toHaveBeenCalledWith("facebook"));
  });

  it("renders the correct default label per provider", () => {
    const { rerender } = render(<OAuthSignInButton provider="google" />);
    expect(screen.getByTestId("google-signin-button")).toHaveTextContent(
      "Continue with Google",
    );

    rerender(<OAuthSignInButton provider="facebook" />);
    expect(screen.getByTestId("facebook-signin-button")).toHaveTextContent(
      "Continue with Facebook",
    );
  });

  it("stashes returnTo in sessionStorage before starting the popup", async () => {
    mockedSignIn.mockImplementationOnce(async () => {
      // At the moment signInWithProvider is called, sessionStorage should
      // already contain the returnTo entry — that's the contract auth.tsx
      // depends on for routing after the popup closes.
      expect(sessionStorage.getItem(RETURN_TO_KEY)).toBe("/projects/42");
      return { ok: true, credential: { user: { getIdToken: vi.fn() } } };
    });

    render(<OAuthSignInButton provider="google" returnTo="/projects/42" />);
    fireEvent.click(screen.getByTestId("google-signin-button"));

    await waitFor(() => expect(mockedSignIn).toHaveBeenCalledTimes(1));
  });

  it("does not touch sessionStorage when returnTo is not provided", async () => {
    mockedSignIn.mockResolvedValueOnce({
      ok: true,
      credential: { user: { getIdToken: vi.fn() } },
    });

    render(<OAuthSignInButton provider="google" />);
    fireEvent.click(screen.getByTestId("google-signin-button"));

    await waitFor(() => expect(mockedSignIn).toHaveBeenCalled());
    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
  });

  it("does NOT call onError when the user closes the popup themselves", async () => {
    mockedSignIn.mockResolvedValueOnce({
      ok: false,
      code: "auth/popup-closed-by-user",
      message: "Popup closed",
    });

    const onError = vi.fn();
    render(<OAuthSignInButton provider="google" onError={onError} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("google-signin-button"));
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it("surfaces errors via onError when the popup fails for a real reason", async () => {
    mockedSignIn.mockResolvedValueOnce({
      ok: false,
      code: "auth/network-request-failed",
      message: "Network error",
    });

    const onError = vi.fn();
    render(<OAuthSignInButton provider="facebook" onError={onError} />);
    fireEvent.click(screen.getByTestId("facebook-signin-button"));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Network error"));
  });

  it("stashes intent='tradesman' in sessionStorage before starting the popup", async () => {
    mockedSignIn.mockImplementationOnce(async () => {
      // Post-auth routing in login.tsx reads this flag to decide whether
      // to send a no-profile user to /tradesman/signup/complete instead
      // of the homeowner /signup/complete page.
      expect(sessionStorage.getItem(INTENT_KEY)).toBe("tradesman");
      return { ok: true, credential: { user: { getIdToken: vi.fn() } } };
    });

    render(<OAuthSignInButton provider="google" intent="tradesman" />);
    fireEvent.click(screen.getByTestId("google-signin-button"));

    await waitFor(() => expect(mockedSignIn).toHaveBeenCalledTimes(1));
  });

  it("clears any stale intent when intent='homeowner' (or unset)", async () => {
    // Pre-seed a stale tradesman intent from a previous sign-in attempt.
    sessionStorage.setItem(INTENT_KEY, "tradesman");

    mockedSignIn.mockImplementationOnce(async () => {
      expect(sessionStorage.getItem(INTENT_KEY)).toBeNull();
      return { ok: true, credential: { user: { getIdToken: vi.fn() } } };
    });

    render(<OAuthSignInButton provider="google" intent="homeowner" />);
    fireEvent.click(screen.getByTestId("google-signin-button"));

    await waitFor(() => expect(mockedSignIn).toHaveBeenCalledTimes(1));
  });

  it("disables the button while the popup is open", async () => {
    let resolveSignIn: (value: any) => void = () => {};
    mockedSignIn.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      }),
    );

    render(<OAuthSignInButton provider="google" />);
    const button = screen.getByTestId(
      "google-signin-button",
    ) as HTMLButtonElement;

    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));

    resolveSignIn({
      ok: true,
      credential: { user: { getIdToken: vi.fn() } },
    });
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  describe("homeowner signup gate (homeowner_signup flag off)", () => {
    function stubLocationReplace() {
      const replaceSpy = vi.fn();
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { replace: replaceSpy, href: "" },
      });
      return replaceSpy;
    }

    it("signs out and redirects a brand-new homeowner when signup is closed", async () => {
      const replaceSpy = stubLocationReplace();
      mockedSignIn.mockResolvedValueOnce({
        ok: true,
        isNewUser: true,
        credential: { user: { getIdToken: vi.fn() } },
      });
      mockGet.mockResolvedValueOnce({ data: { required: true, closed: true } });

      render(<OAuthSignInButton provider="google" intent="homeowner" />);
      fireEvent.click(screen.getByTestId("google-signin-button"));

      await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
      expect(mockGet).toHaveBeenCalledWith("/api/auth/beta-status?role=homeowner");
      expect(replaceSpy).toHaveBeenCalledWith("/signup?signup_closed=1");
    });

    it("blocks the new homeowner fail-safe if the status check errors", async () => {
      const replaceSpy = stubLocationReplace();
      mockedSignIn.mockResolvedValueOnce({
        ok: true,
        isNewUser: true,
        credential: { user: { getIdToken: vi.fn() } },
      });
      mockGet.mockRejectedValueOnce(new Error("network"));

      render(<OAuthSignInButton provider="google" intent="homeowner" />);
      fireEvent.click(screen.getByTestId("google-signin-button"));

      await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
      expect(replaceSpy).toHaveBeenCalledWith("/signup?signup_closed=1");
    });

    it("lets a brand-new homeowner through when signup is open", async () => {
      const replaceSpy = stubLocationReplace();
      mockedSignIn.mockResolvedValueOnce({
        ok: true,
        isNewUser: true,
        credential: { user: { getIdToken: vi.fn() } },
      });
      mockGet.mockResolvedValueOnce({ data: { required: false, closed: false } });

      render(<OAuthSignInButton provider="google" intent="homeowner" />);
      fireEvent.click(screen.getByTestId("google-signin-button"));

      await waitFor(() => expect(mockGet).toHaveBeenCalled());
      expect(signOutMock).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();
    });

    it("never gates a tradesperson signup, even when homeowner signup is closed", async () => {
      const replaceSpy = stubLocationReplace();
      mockedSignIn.mockResolvedValueOnce({
        ok: true,
        isNewUser: true,
        credential: { user: { getIdToken: vi.fn() } },
      });

      render(<OAuthSignInButton provider="google" intent="tradesman" />);
      fireEvent.click(screen.getByTestId("google-signin-button"));

      await waitFor(() => expect(mockedSignIn).toHaveBeenCalled());
      expect(mockGet).not.toHaveBeenCalled();
      expect(signOutMock).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();
    });

    it("does not gate an existing homeowner (isNewUser=false) logging in", async () => {
      const replaceSpy = stubLocationReplace();
      mockedSignIn.mockResolvedValueOnce({
        ok: true,
        isNewUser: false,
        credential: { user: { getIdToken: vi.fn() } },
      });

      render(<OAuthSignInButton provider="google" intent="homeowner" />);
      fireEvent.click(screen.getByTestId("google-signin-button"));

      await waitFor(() => expect(mockedSignIn).toHaveBeenCalled());
      expect(mockGet).not.toHaveBeenCalled();
      expect(signOutMock).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();
    });
  });
});
