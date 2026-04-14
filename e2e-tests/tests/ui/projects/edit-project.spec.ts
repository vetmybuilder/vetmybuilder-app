import Project from "../../../src/models/Project";
import { expect, test } from "../../../src/ui.fixtures";
test.describe("Homeowner projects", () => {
  test("can edit a pending project", async ({
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
      status: "Pending",
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
      status: "Pending",
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
      status: "Pending",
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
});
