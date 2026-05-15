// tests/web/components/ComingSoonSheet.test.tsx
//
// Renders the demand-signal modal in both auth states and asserts the
// UX divergence we ship to launch:
//
//   - Logged-in users: no form, just confirmation copy + "Got it". One
//     authed POST fires on open (server denormalises their email from
//     the firebase token).
//   - Guests: single optional email field + "Notify me" / "Maybe later".
//     Anonymous tap-on-open POST fires immediately; submit fires a
//     second POST with the email + notify=true.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ComingSoonSheet from "@/components/ComingSoonSheet";

// useAuth + useApi are both mocked per test so we can flip between
// "guest" and "logged in" without rerendering provider trees.
const authState: { user: { uid: string } | null; loading: boolean } = {
  user: null,
  loading: false,
};
vi.mock("@/utils/auth", () => ({
  useAuth: () => authState,
}));

const apiPost = vi.fn();
vi.mock("@/utils/api", () => ({
  useApi: () => ({ post: apiPost, get: vi.fn(), patch: vi.fn() }),
}));

// Global fetch stub: capture the POSTs the modal fires.
const fetchMock = vi.fn();

beforeEach(() => {
  apiPost.mockReset();
  apiPost.mockResolvedValue({ data: { ok: true } });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  // @ts-ignore
  globalThis.fetch = fetchMock;
  authState.user = null;
  authState.loading = false;
});

afterEach(() => {
  authState.user = null;
});

describe("<ComingSoonSheet /> - guest variant", () => {
  it("shows the optional email field and Notify CTA", () => {
    render(
      <ComingSoonSheet open category="Kitchen" onClose={() => {}} />,
    );
    expect(
      screen.getByText(/Kitchen is coming soon/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("coming-soon-email")).toBeInTheDocument();
    expect(screen.getByTestId("coming-soon-notify")).toBeInTheDocument();
    expect(screen.getByTestId("coming-soon-dismiss")).toHaveTextContent(
      /maybe later/i,
    );
  });

  it("fires an anonymous tap signal on open (public fetch, no authed call)", async () => {
    render(
      <ComingSoonSheet open category="Kitchen" onClose={() => {}} />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/demand-signal");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ category: "Kitchen" });
    // No authed API call for guests.
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("Notify button is disabled until an email is typed", () => {
    render(
      <ComingSoonSheet open category="Kitchen" onClose={() => {}} />,
    );
    const submit = screen.getByTestId("coming-soon-notify") as HTMLButtonElement;
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId("coming-soon-email"), {
      target: { value: "me@example.com" },
    });
    expect(submit).not.toBeDisabled();
  });

  it("submits email with notify=true and shows the success state", async () => {
    render(
      <ComingSoonSheet open category="Kitchen" onClose={() => {}} />,
    );
    // First fetch fires on open with the tap.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId("coming-soon-email"), {
      target: { value: "me@example.com" },
    });
    fireEvent.click(screen.getByTestId("coming-soon-notify"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const secondBody = JSON.parse(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string,
    );
    expect(secondBody).toEqual({
      category: "Kitchen",
      email: "me@example.com",
      notify: true,
    });

    expect(
      await screen.findByText(/Thanks - we'll be in touch/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("coming-soon-dismiss")).toHaveTextContent(
      /got it/i,
    );
  });
});

describe("<ComingSoonSheet /> - logged-in variant", () => {
  beforeEach(() => {
    authState.user = { uid: "u1" };
  });

  it("hides the form and shows the silent confirmation copy", () => {
    render(
      <ComingSoonSheet open category="Bedroom" onClose={() => {}} />,
    );
    expect(
      screen.getByText(/Your interest in Bedroom has been recorded/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("coming-soon-email")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coming-soon-notify")).not.toBeInTheDocument();
    expect(screen.getByTestId("coming-soon-dismiss")).toHaveTextContent(
      /got it/i,
    );
  });

  it("fires the demand signal via the authed api client (not public fetch)", async () => {
    render(
      <ComingSoonSheet open category="Bedroom" onClose={() => {}} />,
    );
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/api/demand-signal", {
      category: "Bedroom",
    });
    // No anonymous fetch - logged-in path uses the authed client so the
    // server can pull uid + email off the verified token.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("<ComingSoonSheet /> - tap signal is fired exactly once per open", () => {
  it("doesn't refire when the parent re-renders with the same category", async () => {
    const { rerender } = render(
      <ComingSoonSheet open category="Kitchen" onClose={() => {}} />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Trigger a re-render with no prop change. The guarded ref must
    // prevent a duplicate POST.
    rerender(
      <ComingSoonSheet open category="Kitchen" onClose={() => {}} />,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
