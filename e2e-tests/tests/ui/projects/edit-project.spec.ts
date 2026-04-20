import Project from "../../../src/models/Project";
import { expect, test } from "../../../src/ui.fixtures";
test.describe("Homeowner projects", () => {
  test("can edit a live project", async ({
    projectApi,
    projectDetailsPage,
    editProjectPage,
  }) => {
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

    const created = await projectApi.createProject(project.toApiPayload());
    const projectId = created.project?.id ?? created.id;

    await projectDetailsPage.visit(projectId);

    await projectDetailsPage.hasProjectDetails(projectId, project, {
      status: "Live",
      dates: { createdAt: created.project?.createdAt ?? created.createdAt },
    });

    // Edit (draft)
    const updatedPropertyType = "Terraced";
    const updatedBedrooms = 3;
    const updatedTimeframe = "Soon (2–4 weeks)";
    const updatedBudget = "£15k–£30k";
    const updatedMaterials = "Mixed (some provided)";
    const updatedAccess = "Permit required";
    const updatedNotes =
      "Updated notes: please confirm ventilation, remove old unit, and test before leaving.";

    await projectDetailsPage.editProject();
    await editProjectPage.editProjectDetails(project, {
      propertyType: updatedPropertyType,
      bedrooms: updatedBedrooms,
      timeframe: updatedTimeframe,
      budget: updatedBudget,
      materials: updatedMaterials,
      access: updatedAccess,
      extraNotes: updatedNotes,
    });

    const edited = Project.aProject().withRandomDetails({
      category: project.category,
      workTypes: project.workTypes,
      locationQuery: project.locationQuery,
      locationPick: project.locationPick,
      propertyType: updatedPropertyType,
      bedrooms: updatedBedrooms,
      timeframe: updatedTimeframe,
      budget: updatedBudget,
      materials: updatedMaterials,
      access: updatedAccess,
      extraNotes: updatedNotes,
    });
    await projectDetailsPage.waitUntilReady();
    await projectDetailsPage.hasProjectDetails(projectId, edited, {
      status: "Live",
    });
    await projectDetailsPage.assertUpdatedToday();
  });

  test("can edit a published project", async ({
    projectApi,
    projectDetailsPage,
    editProjectPage,
  }) => {
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

    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });
    const projectId = created.id;

    await projectDetailsPage.visit(projectId);
    await projectDetailsPage.hasProjectDetails(projectId, project, {
      status: "Live",
    });

    // set as object
    const updatedPropertyType = "Terraced";
    const updatedBedrooms = 3;
    const updatedTimeframe = "Soon (2–4 weeks)";
    const updatedBudget = "£15k–£30k";
    const updatedMaterials = "Mixed (some provided)";
    const updatedAccess = "Permit required";
    const updatedNotes =
      "Updated notes (published): please confirm ventilation, remove old unit, and test before leaving.";

    await projectDetailsPage.editProject(projectId);

    await editProjectPage.editProjectDetails(project, {
      propertyType: updatedPropertyType,
      bedrooms: updatedBedrooms,
      timeframe: updatedTimeframe,
      budget: updatedBudget,
      materials: updatedMaterials,
      access: updatedAccess,
      extraNotes: updatedNotes,
    });

    const edited = Project.aProject().withRandomDetails({
      category: project.category,
      workTypes: project.workTypes,
      locationQuery: project.locationQuery,
      locationPick: project.locationPick,
      propertyType: updatedPropertyType,
      bedrooms: updatedBedrooms,
      timeframe: updatedTimeframe,
      budget: updatedBudget,
      materials: updatedMaterials,
      access: updatedAccess,
      extraNotes: updatedNotes,
    });

    await projectDetailsPage.hasProjectDetails(projectId, edited, {
      status: "Live",
    });
    await projectDetailsPage.assertUpdatedToday();
  });

  test("can edit a flooring project's structured answers", async ({
    projectApi,
    projectDetailsPage,
    editProjectPage,
  }) => {
    const project = Project.aProject()
      .withRandomDetails({
        category: "Flooring",
        workTypes: ["Laminate Installation"],
        locationQuery: "E4",
        locationPick: "E4 0BQ",
        propertyType: "Semi-Detached",
        bedrooms: 4,
        timeframe: "Urgent (1-2 weeks)",
        budget: "£15k-£30k",
        materials: "Supplied by homeowner",
        access: "Parking available",
        extraNotes: "Replace laminate throughout the house.",
      })
      .withFlooringAnswers({
        size: { kind: "m2", value: 25 },
        floor_type: "laminate",
        removal_required: false,
      });

    const created = await projectApi.createProject(project.toApiPayload());
    const projectId = created.id;

    await projectDetailsPage.visit(projectId);
    await projectDetailsPage.hasProjectDetails(projectId, project, {
      status: "Live",
    });

    // Drive the edit wizard — the page object asserts pre-populated state
    // step-by-step (including flooring) and applies our requested update.
    await projectDetailsPage.editProject();
    await editProjectPage.editProjectDetails(project, {
      flooringAnswers: {
        size: { kind: "rooms", value: 2 },
        floor_type: "solid_wood",
        removal_required: true,
        subfloor_condition: "level",
      },
    });

    const edited = Project.aProject()
      .withRandomDetails({
        category: project.category,
        workTypes: project.workTypes,
        locationQuery: project.locationQuery,
        locationPick: project.locationPick,
        propertyType: project.propertyType,
        bedrooms: project.bedrooms,
        timeframe: project.timeframe,
        budget: project.budget,
        materials: project.materials,
        access: project.access,
        extraNotes: project.extraNotes,
      })
      .withFlooringAnswers({
        size: { kind: "rooms", value: 2 },
        floor_type: "solid_wood",
        removal_required: true,
        subfloor_condition: "level",
      });

    await projectApi.hasAnswers(projectId, edited);
  });

  test("price-range badge updates when flooring answers change", async ({
    projectApi,
    projectDetailsPage,
    editProjectPage,
  }) => {
    // Start with a big engineered-wood job — produces a high range.
    const project = Project.aProject()
      .withRandomDetails({
        category: "Flooring",
        workTypes: ["Carpet Fitting"],
      })
      .withFlooringAnswers({
        size: { kind: "m2", value: 50 },
        floor_type: "engineered_wood",
      });

    const created = await projectApi.createProject(project.toApiPayload());

    await projectDetailsPage.visit(created.id);
    // 50 m² engineered wood: (25+40)–(40+90) × 50 = 3,250–6,500
    await projectDetailsPage.hasPriceRangeBadge({ min: 3250, max: 6500 });

    // Edit to a much cheaper setup: same area but carpet, no extras.
    await projectDetailsPage.editProject();
    await editProjectPage.editProjectDetails(project, {
      flooringAnswers: {
        size: { kind: "m2", value: 50 },
        floor_type: "carpet",
      },
    });

    // 50 m² carpet: (8+10)–(12+30) × 50 = 900–2,100
    await projectDetailsPage.hasPriceRangeBadge({ min: 900, max: 2100 });
  });

  test("deterministic price-range stops showing when the work type is edited to a non-flooring type", async ({
    projectApi,
    projectDetailsPage,
    editProjectPage,
  }) => {
    const project = Project.aProject()
      .withRandomDetails({
        category: "Flooring",
        workTypes: ["Carpet Fitting"],
      })
      .withFlooringAnswers({
        size: { kind: "m2", value: 30 },
        floor_type: "laminate",
      });

    const created = await projectApi.createProject(project.toApiPayload());

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasPriceRangeBadge();

    await projectDetailsPage.editProject();
    await editProjectPage.editProjectDetails(project, {
      category: "Appliances",
      workTypes: ["Tumble Dryer Installation"],
    });

    // Backend state: structured answers cleared.
    await projectApi.hasNoAnswers(created.id);

    // UI: the deterministic range is gone. The badge may still render with
    // the AI-fallback caveat once the classifier re-runs on the updated
    // project — that's fine, we only care that it no longer claims to be
    // derived from the homeowner's (now empty) structured answers.
    await projectDetailsPage.hasNoDeterministicPriceRangeBadge();
  });
});
