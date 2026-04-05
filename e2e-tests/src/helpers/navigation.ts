import type { Page } from "@playwright/test";

type WaitUntil = "domcontentloaded" | "load" | "networkidle";

type SafeGotoOptions = {
  /** Passed to page.goto. Defaults to "domcontentloaded". */
  waitUntil?: WaitUntil;
  /** How long to wait for the page to settle after an interrupted navigation. Defaults to 10 000 ms. */
  settleTimeout?: number;
};

/**
 * Navigates to `url` and handles two WebKit-specific transient errors:
 *
 * - "interrupted by another navigation" — the /logout page's deferred
 *   window.location.replace fires mid-navigation. We wait for the page to
 *   settle and retry if the browser didn't land on the target URL.
 *
 * - "WebKit encountered an internal error" — resource-pressure crash on
 *   first load. Retry once.
 */
export async function safeGoto(
  page: Page,
  url: string,
  options: SafeGotoOptions = {},
): Promise<void> {
  const waitUntil = options.waitUntil ?? "domcontentloaded";
  const settleTimeout = options.settleTimeout ?? 10_000;

  try {
    await page.goto(url, { waitUntil });
  } catch (err) {
    const msg = String(err);
    if (
      msg.includes("interrupted by another navigation") ||
      msg.includes("WebKit encountered an internal error")
    ) {
      await page
        .waitForLoadState("domcontentloaded", { timeout: settleTimeout })
        .catch(() => {});
      if (!page.url().includes(url)) {
        await page.goto(url, { waitUntil });
      }
    } else {
      throw err;
    }
  }
}
