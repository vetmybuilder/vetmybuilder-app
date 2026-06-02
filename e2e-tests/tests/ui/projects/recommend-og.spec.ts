import { setupOwnerWithLiveProject } from "../../../src/apiHelper/project/setupOwnerWithLiveProject";
import { test, expect } from "../../../src/ui.fixtures";

test.describe("Recommend page Open Graph", () => {
  test("SSR renders the per-project og:title", async ({ request, runtime }) => {
    const { projectId } = await setupOwnerWithLiveProject({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      location: "E4",
    });

    const origin = new URL(runtime.webBaseUrl).origin;
    const res = await request.get(`${origin}/projects/${projectId}/recommend`);
    expect(res.status()).toBe(200);

    const html = await res.text();
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    // The per-project title uses the "· <name>" form; the generic fallback
    // uses "- VetMyBuilder". The middot proves the SSR project fetch ran.
    expect(html).toContain("Recommend a tradesperson ·");
  });

  test("invalid project still returns 200 with generic OG tags", async ({
    request,
    runtime,
  }) => {
    const origin = new URL(runtime.webBaseUrl).origin;
    const res = await request.get(`${origin}/projects/99999999/recommend`);
    expect(res.status()).toBe(200);

    const html = await res.text();
    expect(html).toContain('property="og:title"');
    expect(html).toContain("Recommend a tradesperson - VetMyBuilder");
  });
});
