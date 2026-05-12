// tests/web/utils/useRole.test.tsx
//
// Regression guard for the May 2026 "tradesperson sees homeowner CTAs
// on /" bug. Root cause: useRole trusted the vmb:isTradesman = "0"
// cache entry as authoritative. But SiteHeader writes "0" speculatively
// whenever !displayUser - including on a hard reload before auth has
// resolved. If useRole ran after auth resolved but before SiteHeader's
// /api/tradesmen/me call landed, it locked in role="user" from that
// stale "0" and never re-checked.
//
// These tests pin the contract: only "1" is fast-path authoritative,
// "0" must fall through to the API.

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const get = vi.fn();
vi.mock("@/utils/api", () => ({ useApi: () => ({ get }) }));

const useAuthMock = vi.fn();
vi.mock("@/utils/auth", () => ({
  useAuth: () => useAuthMock(),
}));

import { useRole } from "@/utils/useRole";

describe("useRole — cache trust rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("falls through to the API when the cache is the stale pre-login '0'", async () => {
    // The race: SiteHeader wrote "0" while auth was still loading. Auth
    // has now resolved as Elegant (a tradesperson). The cache is a lie
    // from a previous render frame.
    try {
      sessionStorage.setItem("vmb:isTradesman", "0");
    } catch {
      /* ignore */
    }
    useAuthMock.mockReturnValue({
      user: { uid: "trade-1" },
      loading: false,
    });
    // The authoritative API call - returns the truth.
    get.mockResolvedValueOnce({
      data: { role: "tradesman", profile: { user_id: "trade-1" } },
    });

    const { result } = renderHook(() => useRole());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.role).toBe("tradesman");
    expect(get).toHaveBeenCalledWith("/api/tradesmen/me");
  });

  it("trusts the cache when it says '1' (no API call needed)", async () => {
    try {
      sessionStorage.setItem("vmb:isTradesman", "1");
    } catch {
      /* ignore */
    }
    useAuthMock.mockReturnValue({
      user: { uid: "trade-2" },
      loading: false,
    });

    const { result } = renderHook(() => useRole());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.role).toBe("tradesman");
    // Fast path: the cache was affirmative, so no API call is required.
    expect(get).not.toHaveBeenCalled();
  });

  it("falls through to the API when the cache is missing", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "u-3" },
      loading: false,
    });
    get.mockResolvedValueOnce({
      data: { role: "user", profile: null },
    });

    const { result } = renderHook(() => useRole());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.role).toBe("user");
    expect(get).toHaveBeenCalledWith("/api/tradesmen/me");
  });

  it("returns 'guest' when there's no user, no API call fired", async () => {
    useAuthMock.mockReturnValue({
      user: null,
      loading: false,
    });

    const { result } = renderHook(() => useRole());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.role).toBe("guest");
    expect(get).not.toHaveBeenCalled();
  });
});
