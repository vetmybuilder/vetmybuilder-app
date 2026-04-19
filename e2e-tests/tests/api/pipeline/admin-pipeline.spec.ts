import { test, expect } from "../../../src/fixtures";

test.describe("Admin trades pipeline API", () => {
  test("lists pipeline entries filtered by status", async ({
    pipelineApi,
  }) => {
    await pipelineApi.insertEntry({
      companyName: "Pending Builder Ltd",
      tradeTypes: "builder",
      serviceAreas: "E4",
      vettingScore: 75,
      status: "pending",
    });
    await pipelineApi.insertEntry({
      companyName: "Approved Plumber Ltd",
      tradeTypes: "plumber",
      serviceAreas: "E4",
      vettingScore: 80,
      status: "approved",
    });

    const pending = await pipelineApi.list({ status: "pending" });
    expect(pending.total).toBe(1);
    expect(pending.items[0].company_name).toBe("Pending Builder Ltd");

    const approved = await pipelineApi.list({ status: "approved" });
    expect(approved.total).toBe(1);
    expect(approved.items[0].company_name).toBe("Approved Plumber Ltd");

    const all = await pipelineApi.list();
    expect(all.total).toBe(2);
  });

  test("search filters by company name", async ({
    pipelineApi,
  }) => {
    await pipelineApi.insertEntry({
      companyName: "Alpha Roofing Ltd",
      tradeTypes: "roofer",
      serviceAreas: "N1",
      vettingScore: 75,
    });
    await pipelineApi.insertEntry({
      companyName: "Beta Plumbing Ltd",
      tradeTypes: "plumber",
      serviceAreas: "E4",
      vettingScore: 80,
    });

    const results = await pipelineApi.list({ q: "Alpha" });
    expect(results.total).toBe(1);
    expect(results.items[0].company_name).toBe("Alpha Roofing Ltd");
  });

  test("approve changes status from pending to approved", async ({
    pipelineApi,
  }) => {
    const id = await pipelineApi.insertEntry({
      companyName: "Approvable Ltd",
      tradeTypes: "plumber",
      serviceAreas: "E4",
      vettingScore: 75,
      status: "pending",
    });

    await pipelineApi.approve(id);

    const entry = await pipelineApi.getEntryById(id);
    expect(entry.status).toBe("approved");
  });

  test("reject changes status from pending to rejected", async ({
    pipelineApi,
  }) => {
    const id = await pipelineApi.insertEntry({
      companyName: "Rejectable Ltd",
      tradeTypes: "plumber",
      serviceAreas: "E4",
      vettingScore: 30,
      status: "pending",
    });

    await pipelineApi.reject(id);

    const entry = await pipelineApi.getEntryById(id);
    expect(entry.status).toBe("rejected");
  });
});
