import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
// passing
test.describe("Homeowner projects", () => {
  // This test drives the full multi-step create-project form and then validates
  // the resulting project page — it is inherently the slowest test in the suite.
  test("can create a project and lands on the project page", async ({
    createProjectPage,
    projectDetailsPage,
    homeownerProjectsPage,
  }, testInfo) => {
    const isMobile = testInfo.project.name.startsWith("ui-mobile-");
    // webkit is ~50% slower than chromium under Docker resource pressure
    test.setTimeout(isMobile ? 240_000 : 180_000);

    const project = Project.aProject().withRandomDetails({
      category: "Appliances",
      workTypes: ["Tumble Dryer Installation"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
      propertyType: "Semi-Detached",
      bedrooms: 4,
      timeframe: "Urgent (1-2 weeks)",
      budget: "£30k-£60k",
      materials: "Supplied by homeowner",
      access: "Parking available",
      extraNotes: "Install new tumble dryer and ensure correct ventilation.",
    });

    const projectId = await createProjectPage.createProject(
      project.toCreateInput(),
      isMobile,
    );

    await projectDetailsPage.hasProjectDetails(projectId, project, {
      status: "Pending",
      dates: { createdAt: new Date() },
    });

    await projectDetailsPage.hasTopRecommendations(false);
    await projectDetailsPage.hasSpotlight(false);

    await projectDetailsPage.goBack();

    await homeownerProjectsPage.hasProject([project]);
  });

  test("creating a Flooring project captures the structured answers", async ({
    createProjectPage,
    projectDetailsPage,
    projectApi,
  }, testInfo) => {
    const isMobile = testInfo.project.name.startsWith("ui-mobile-");
    test.setTimeout(isMobile ? 240_000 : 180_000);

    const project = Project.aProject()
      .withRandomDetails({
        category: "Flooring",
        workTypes: ["Carpet Fitting"],
        locationQuery: "E4",
        locationPick: "E4 0BQ",
        propertyType: "Semi-Detached",
        bedrooms: 4,
        timeframe: "Urgent (1-2 weeks)",
        budget: "£30k-£60k",
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

    const projectId = await createProjectPage.createProject(
      project.toCreateInput(),
      isMobile,
    );

    await projectDetailsPage.hasProjectDetails(projectId, project, {
      status: "Pending",
      dates: { createdAt: new Date() },
    });

    await projectApi.hasAnswers(projectId, project);
    // 40 m² engineered wood + removal + needs_levelling
    //   labour (25+5+15)–(40+15+30) = 45–85 + material 40–90
    //   → per-m² 85–175 × 40 = 3,400–7,000
    await projectDetailsPage.hasPriceRangeBadge({ min: 3400, max: 7000 });
  });

  test("creating a Bathroom Flooring project (cross-category) captures the structured answers", async ({
    createProjectPage,
    projectApi,
  }, testInfo) => {
    const isMobile = testInfo.project.name.startsWith("ui-mobile-");
    test.setTimeout(isMobile ? 240_000 : 180_000);

    const project = Project.aProject()
      .withRandomDetails({
        category: "Bathroom",
        workTypes: ["Bathroom Flooring"],
        locationQuery: "E4",
        locationPick: "E4 0BQ",
        propertyType: "Flat",
        bedrooms: 2,
        timeframe: "Urgent (1-2 weeks)",
        budget: "£5k-£15k",
        materials: "Supplied by tradesman",
        access: "Easy access",
        extraNotes: "Family bathroom floor replacement.",
      })
      .withFlooringAnswers({
        size: { kind: "rooms", value: 1 },
        floor_type: "tile",
      });

    const projectId = await createProjectPage.createProject(
      project.toCreateInput(),
      isMobile,
    );

    await projectApi.hasAnswers(projectId, project);
  });

  test("creating an Insulation project captures the structured answers and shows a cost range", async ({
    createProjectPage,
    projectDetailsPage,
    projectApi,
  }, testInfo) => {
    const isMobile = testInfo.project.name.startsWith("ui-mobile-");
    test.setTimeout(isMobile ? 240_000 : 180_000);

    const project = Project.aProject()
      .withRandomDetails({
        category: "Insulation",
        workTypes: ["Loft Insulation"],
        locationQuery: "E4",
        locationPick: "E4 0BQ",
        propertyType: "Detached",
        bedrooms: 3,
        timeframe: "Urgent (1-2 weeks)",
        budget: "£5k-£15k",
        materials: "Supplied by tradesman",
        access: "Easy access",
        extraNotes: "Upgrading loft insulation to meet current standards.",
      })
      .withInsulationAnswers({ area_m2: 60, current_state: "thin" });

    const projectId = await createProjectPage.createProject(
      project.toCreateInput(),
      isMobile,
    );

    await projectApi.hasAnswers(projectId, project);
    // 60 m² loft @ £15-£30/m² = £900–£1,800
    await projectDetailsPage.hasPriceRangeBadge({ min: 900, max: 1800 });
  });

  test("a non-flooring work type skips the dynamic step and stores no answers", async ({
    createProjectPage,
    projectApi,
  }, testInfo) => {
    const isMobile = testInfo.project.name.startsWith("ui-mobile-");
    test.setTimeout(isMobile ? 240_000 : 180_000);

    const project = Project.aProject().withRandomDetails({
      category: "Bathroom",
      workTypes: ["Wet Room Installation"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
      propertyType: "Terraced",
      bedrooms: 3,
      timeframe: "Urgent (1-2 weeks)",
      budget: "£15k-£30k",
      materials: "Supplied by tradesman",
      access: "Parking available",
      extraNotes: "Full wet room install with glass screen.",
    });
    // No .withFlooringAnswers() — the wizard should not present it.

    const projectId = await createProjectPage.createProject(
      project.toCreateInput(),
      isMobile,
    );

    await projectApi.hasNoAnswers(projectId);
  });
});
