import { test, expect } from "../../../src/fixtures";
import Tradesman from "../../../src/models/tradesman";
import Project from "../../../src/models/Project";

test.describe("Pipeline auto-claim on tradesman join", () => {
  test("tradesman joining with matching company name claims the pipeline entry", async ({
    pipelineApi,
    tradesmanApi,
  }) => {
    const companyName = `E2E Claim Test Ltd ${Date.now()}`;

    const entryId = await pipelineApi.insertEntry({
      companyName,
      tradeTypes: "plumber",
      serviceAreas: "E4",
      vettingScore: 80,
      status: "approved",
    });

    await pipelineApi.expectNotClaimed(entryId);

    const tradesman = Tradesman.aTradesman().withRandomDetails();
    tradesman.companyName = companyName;
    await tradesmanApi.join(tradesman);

    const entry = await pipelineApi.getEntryById(entryId);
    expect(entry.claimed_by).toBeTruthy();
  });

  test("tradesman joining with non-matching company name does not claim any entry", async ({
    pipelineApi,
    tradesmanApi,
  }) => {
    const entryId = await pipelineApi.insertEntry({
      companyName: "Unrelated Company Ltd",
      tradeTypes: "plumber",
      serviceAreas: "E4",
      vettingScore: 80,
      status: "approved",
    });

    const tradesman = Tradesman.aTradesman().withRandomDetails();
    tradesman.companyName = `Completely Different ${Date.now()} Ltd`;
    await tradesmanApi.join(tradesman);

    await pipelineApi.expectNotClaimed(entryId);
  });

  test("pipeline entry is not claimed if it is still pending", async ({
    pipelineApi,
    tradesmanApi,
  }) => {
    const companyName = `E2E Pending Claim ${Date.now()} Ltd`;

    const entryId = await pipelineApi.insertEntry({
      companyName,
      tradeTypes: "electrician",
      serviceAreas: "N1",
      vettingScore: 75,
      status: "pending",
    });

    const tradesman = Tradesman.aTradesman().withRandomDetails();
    tradesman.companyName = companyName;
    await tradesmanApi.join(tradesman);

    await pipelineApi.expectNotClaimed(entryId);
  });

  test("pipeline recommendations are linked to the tradesman on claim", async ({
    pipelineApi,
    projectApi,
    tradesmanApi,
  }) => {
    const companyName = `E2E Link Test Ltd ${Date.now()}`;

    // 1. Insert approved pipeline entry
    await pipelineApi.insertEntry({
      companyName,
      tradeTypes: "plumber",
      serviceAreas: "E4",
      vettingScore: 80,
      status: "approved",
    });

    // 2. Insert a pipeline recommendation directly (simulates what auto-surface does)
    const project = Project.aProject().withRandomDetails({
      category: "Plumbing",
      workTypes: ["Bathroom Plumbing"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
    });
    const created = await projectApi.createProject(project.toApiPayload());
    await pipelineApi.insertPipelineRecommendation(created.id, companyName);

    // 3. Tradesman joins with matching name — triggers claim + link
    const tradesman = Tradesman.aTradesman().withRandomDetails();
    tradesman.companyName = companyName;
    await tradesmanApi.join(tradesman);

    // 4. Verify the recommendation is now linked
    await pipelineApi.expectRecLinkedToTradesman(companyName);
  });
});
