import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";

test.describe("Homeowner jobs", () => {
  test("can create a job and lands on the job page", async ({
    createProjectPage,
    projectDetailsPage,
  }, testInfo) => {
    const isMobile = testInfo.project.name.startsWith("ui-mobile-");
    test.setTimeout(isMobile ? 240_000 : 180_000);

    const job = Project.aProject().withRandomDetails({
      category: "Appliances",
      workTypes: ["Tumble Dryer Installation"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
      propertyType: "Semi-Detached",
      bedrooms: 4,
      timeframe: "Urgent (1-2 weeks)",
      budget: "5k - 15k",
      materials: "Supplied by tradesman",
      access: "Parking available",
      extraNotes: "Install new tumble dryer and ensure correct ventilation.",
    });

    await createProjectPage.createProject(job.toCreateInput(), isMobile);

    await projectDetailsPage.assertJobMetadataVisible(job);
    await projectDetailsPage.assertAutoPublishedLiveState();
  });

  test("creating a Flooring job captures structured answers and shows a price range", async ({
    createProjectPage,
    projectDetailsPage,
    projectApi,
  }, testInfo) => {
    const isMobile = testInfo.project.name.startsWith("ui-mobile-");
    test.setTimeout(isMobile ? 240_000 : 180_000);

    const job = Project.aProject()
      .withRandomDetails({
        category: "Flooring",
        workTypes: ["Carpet Fitting"],
        locationQuery: "E4",
        locationPick: "E4 0BQ",
        propertyType: "Semi-Detached",
        bedrooms: 4,
        timeframe: "Urgent (1-2 weeks)",
        budget: "5k - 15k",
        materials: "Supplied by homeowner",
        access: "Parking available",
        extraNotes: "New carpet throughout the ground floor.",
      })
      .withFlooringAnswers({
        size: { kind: "m2", value: 40 },
        floor_type: "engineered_wood",
        removal_required: true,
        subfloor_condition: "needs_levelling",
      });

    const jobId = await createProjectPage.createProject(
      job.toCreateInput(),
      isMobile,
    );

    await projectDetailsPage.assertJobMetadataVisible(job);
    await projectApi.hasAnswers(jobId, job);
    await projectDetailsPage.hasPriceRangeBadge({ min: 3400, max: 7000 });
  });

  test("creating a Bathroom Flooring job (cross-category) captures structured answers", async ({
    createProjectPage,
    projectApi,
  }, testInfo) => {
    const isMobile = testInfo.project.name.startsWith("ui-mobile-");
    test.setTimeout(isMobile ? 240_000 : 180_000);

    const job = Project.aProject()
      .withRandomDetails({
        category: "Bathroom",
        workTypes: ["Bathroom Flooring"],
        locationQuery: "E4",
        locationPick: "E4 0BQ",
        propertyType: "Flat",
        bedrooms: 2,
        timeframe: "Urgent (1-2 weeks)",
        budget: "1k - 5k",
        materials: "Supplied by tradesman",
        access: "Easy access",
        extraNotes: "Family bathroom floor replacement.",
      })
      .withFlooringAnswers({
        size: { kind: "rooms", value: 1 },
        floor_type: "tile",
      });

    const jobId = await createProjectPage.createProject(
      job.toCreateInput(),
      isMobile,
    );

    await projectApi.hasAnswers(jobId, job);
  });

  test("creating an Insulation job captures structured answers and shows a cost range", async ({
    createProjectPage,
    projectDetailsPage,
    projectApi,
  }, testInfo) => {
    const isMobile = testInfo.project.name.startsWith("ui-mobile-");
    test.setTimeout(isMobile ? 240_000 : 180_000);

    const job = Project.aProject()
      .withRandomDetails({
        category: "Insulation",
        workTypes: ["Loft Insulation"],
        locationQuery: "E4",
        locationPick: "E4 0BQ",
        propertyType: "Detached",
        bedrooms: 3,
        timeframe: "Urgent (1-2 weeks)",
        budget: "1k - 5k",
        materials: "Supplied by tradesman",
        access: "Side access available",
        extraNotes: "Upgrading loft insulation to current standards.",
      })
      .withInsulationAnswers({ area_m2: 60, current_state: "thin" });

    const jobId = await createProjectPage.createProject(
      job.toCreateInput(),
      isMobile,
    );

    await projectApi.hasAnswers(jobId, job);
    await projectDetailsPage.hasPriceRangeBadge({ min: 900, max: 1800 });
  });

  test("a non-flooring work type skips the dynamic step and stores no answers", async ({
    createProjectPage,
    projectApi,
  }, testInfo) => {
    const isMobile = testInfo.project.name.startsWith("ui-mobile-");
    test.setTimeout(isMobile ? 240_000 : 180_000);

    const job = Project.aProject().withRandomDetails({
      category: "Bathroom",
      workTypes: ["Wet Room Installation"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
      propertyType: "Terraced",
      bedrooms: 3,
      timeframe: "Urgent (1-2 weeks)",
      budget: "5k - 15k",
      materials: "Supplied by tradesman",
      access: "Parking available",
      extraNotes: "Full wet room install with glass screen.",
    });

    const jobId = await createProjectPage.createProject(
      job.toCreateInput(),
      isMobile,
    );

    await projectApi.hasNoAnswers(jobId);
  });
});
