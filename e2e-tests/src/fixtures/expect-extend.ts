import { expect as baseExpect } from "@playwright/test";
import type { Locator } from "@playwright/test";

// Allow plain strings or asymmetric matchers like expect.any(String)
type AnyMatcher = ReturnType<typeof baseExpect.any>;
type TableCell = string | number | undefined | AnyMatcher;
type TableData = TableCell[][];
type OrderToken = string | RegExp;

export const expect = baseExpect.extend({
  async toHaveLabelValuePair(
    received: Record<string, any>,
    label: string,
    value: any
  ) {
    const pass =
      received &&
      Object.prototype.hasOwnProperty.call(received, label) &&
      received[label] === value;

    return {
      pass,
      message: () =>
        pass
          ? `expected object not to have label "${label}" with value ${JSON.stringify(
              value
            )}`
          : `expected object to have label "${label}" with value ${JSON.stringify(
              value
            )}, got ${JSON.stringify(received?.[label])}`,
    };
  },

  async toHaveTableData(
    locator: Locator,
    expectedData: TableData,
    options?: { timeout?: number; pageReload?: boolean }
  ) {
    try {
      await locator.waitFor({ state: "attached", timeout: options?.timeout });

      await baseExpect
        .poll(
          async () => {
            // Headers: prefer stable data-colname, fall back to trimmed text
            const ths = await locator.locator("thead > tr > th").all();
            const headers = await Promise.all(
              ths.map(async (th) => {
                const col = await th.getAttribute("data-colname");
                return col ?? normalizeCell(await th.innerText());
              })
            );

            // Body rows
            const rows = await locator.locator("tbody > tr").all();
            const rowData = await Promise.all(
              rows.map(async (row) =>
                (await row.locator("td").allInnerTexts()).map(normalizeCell)
              )
            );

            // Optional refresh if size mismatch (useful for badge/status updates)
            const expectedBodyRows = Math.max(0, expectedData.length - 1);
            if (options?.pageReload && rowData.length !== expectedBodyRows) {
              await locator.page().reload();
            }

            return [headers, ...rowData];
          },
          { timeout: options?.timeout }
        )
        .toEqual(expectedData); // supports asymmetric matchers inside expectedData

      return { pass: true, message: () => "" };
    } catch (e) {
      return {
        pass: false,
        message: () =>
          e instanceof Error
            ? e.message
            : `An unknown error occurred, error: ${JSON.stringify(e)}`,
      };
    }
  },

  /**
   * Assert that a Locator's text contains all tokens in order (not necessarily adjacent).
   * Retries until timeout so it’s resilient to streaming/SSE/hydration delays.
   */
  async toContainTextInOrder(
    locator: Locator,
    tokens: OrderToken[],
    options?: { timeout?: number; intervalMs?: number }
  ) {
    const timeout = options?.timeout ?? 5000;
    const interval = options?.intervalMs ?? 100;
    const deadline = Date.now() + timeout;

    await locator.waitFor({ state: "attached", timeout });

    let lastText = "";

    while (Date.now() < deadline) {
      const raw = (await locator.textContent().catch(() => null)) ?? "";
      const text = raw.replace(/\s+/g, " ").trim();
      lastText = text;

      // Check tokens in order
      let cursor = 0;
      let ok = true;

      for (const tok of tokens) {
        if (typeof tok === "string") {
          const idx = text.indexOf(tok, cursor);
          if (idx === -1) {
            ok = false;
            break;
          }
          cursor = idx + tok.length;
        } else {
          const slice = text.slice(cursor);
          const m = slice.match(tok);
          if (!m || m.index === undefined) {
            ok = false;
            break;
          }
          cursor += (m.index ?? 0) + m[0].length;
        }
      }

      if (ok) {
        return { pass: true, message: () => "" };
      }

      await locator.page().waitForTimeout(interval);
    }

    return {
      pass: false,
      message: () =>
        `expected ${locator} to contain tokens in order: ${tokens
          .map(String)
          .join(" → ")}\nActual text:\n"${lastText}"`,
    };
  },
});

function normalizeCell(s: string): string {
  // Collapse whitespace and trim – keeps assertions stable across browsers/CI
  return s.replace(/\s+/g, " ").trim();
}

export {};
