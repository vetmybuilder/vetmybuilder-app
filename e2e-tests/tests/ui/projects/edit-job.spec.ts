import Project from "../../../src/models/Project";
import { test } from "../../../src/ui.fixtures";

test.describe("Homeowner jobs", () => {
  test("can edit a live job", async ({
    projectApi,
    projectDetailsPage,
    editProjectPage,
  }) => {
    const job = Project.aProject().withRandomDetails({
      category: "Appliances",
      workTypes: ["Tumble Dryer Installation"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
      propertyType: "Semi-Detached",
      bedrooms: 4,
      timeframe: "Urgent (1-2 weeks)",
      budget: "5k - 15k",
      materials: "Supplied by homeowner",
      access: "Parking available",
      extraNotes: "Install new tumble dryer and ensure correct ventilation.",
    });

    const created = await projectApi.createProject(job.toApiPayload());
    const jobId = created.id;

    await projectDetailsPage.visit(jobId);
    await projectDetailsPage.assertJobMetadataVisible(job);

    const updates = {
      propertyType: "Terraced",
      bedrooms: 3,
      timeframe: "Soon (2-4 weeks)",
      budget: "15k - 30k",
      materials: "Mixed (some provided)",
      access: "Street parking only",
      extraNotes: "Updated notes: please confirm ventilation and test.",
    };

    await projectDetailsPage.editJob(jobId);
    await editProjectPage.editProjectDetails(job, updates);

    const edited = Project.aProject().withRandomDetails({
      category: job.category,
      workTypes: job.workTypes,
      locationQuery: job.locationQuery,
      locationPick: job.locationPick,
      ...updates,
    });

    await projectDetailsPage.assertJobMetadataVisible(edited);
  });

  test("can edit a Flooring job's structured answers", async ({
    projectApi,
    projectDetailsPage,
    editProjectPage,
  }) => {
    const job = Project.aProject()
      .withRandomDetails({
        category: "Flooring",
        workTypes: ["Laminate Installation"],
        locationQuery: "E4",
        locationPick: "E4 0BQ",
        propertyType: "Semi-Detached",
        bedrooms: 4,
        timeframe: "Urgent (1-2 weeks)",
        budget: "5k - 15k",
        materials: "Supplied by homeowner",
        access: "Parking available",
        extraNotes: "Replace laminate throughout the house.",
      })
      .withFlooringAnswers({
        size: { kind: "m2", value: 25 },
        floor_type: "laminate",
        removal_required: false,
      });

    const created = await projectApi.createProject(job.toApiPayload());
    const jobId = created.id;

    await projectDetailsPage.visit(jobId);
    await projectDetailsPage.assertJobMetadataVisible(job);

    await projectDetailsPage.editJob(jobId);
    await editProjectPage.editProjectDetails(job, {
      flooringAnswers: {
        size: { kind: "rooms", value: 2 },
        floor_type: "solid_wood",
        removal_required: true,
        subfloor_condition: "level",
      },
    });

    const edited = Project.aProject()
      .withRandomDetails({
        category: job.category,
        workTypes: job.workTypes,
        locationQuery: job.locationQuery,
        locationPick: job.locationPick,
        propertyType: job.propertyType,
        bedrooms: job.bedrooms,
        timeframe: job.timeframe,
        budget: job.budget,
        materials: job.materials,
        access: job.access,
        extraNotes: job.extraNotes,
      })
      .withFlooringAnswers({
        size: { kind: "rooms", value: 2 },
        floor_type: "solid_wood",
        removal_required: true,
        subfloor_condition: "level",
      });

    await projectApi.hasAnswers(jobId, edited);
  });

  test("price-range updates when flooring answers change", async ({
    projectApi,
    projectDetailsPage,
    editProjectPage,
  }) => {
    const job = Project.aProject()
      .withRandomDetails({
        category: "Flooring",
        workTypes: ["Carpet Fitting"],
      })
      .withFlooringAnswers({
        size: { kind: "m2", value: 50 },
        floor_type: "engineered_wood",
      });

    const created = await projectApi.createProject(job.toApiPayload()); // how do you check this runs successfully?

    await projectDetailsPage.visit(created.id); // its failing on this line which means the above didnt run successfully. have you considered using playwrights polling there?
    await projectDetailsPage.hasPriceRangeBadge({ min: 3250, max: 6500 });

    await projectDetailsPage.editJob(created.id);
    await editProjectPage.editProjectDetails(job, {
      flooringAnswers: {
        size: { kind: "m2", value: 50 },
        floor_type: "carpet",
      },
    });

    await projectDetailsPage.hasPriceRangeBadge({ min: 900, max: 2100 });
  });

  test("switching to a non-flooring work type clears the price-range", async ({
    projectApi,
    projectDetailsPage,
    editProjectPage,
  }) => {
    const job = Project.aProject()
      .withRandomDetails({
        category: "Flooring",
        workTypes: ["Carpet Fitting"],
      })
      .withFlooringAnswers({
        size: { kind: "m2", value: 30 },
        floor_type: "laminate",
      });

    const created = await projectApi.createProject(job.toApiPayload());

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasPriceRangeBadge();

    await projectDetailsPage.editJob(created.id);
    await editProjectPage.editProjectDetails(job, {
      category: "Appliances",
      workTypes: ["Tumble Dryer Installation"],
    });

    await projectApi.hasNoAnswers(created.id);
    await projectDetailsPage.hasNoDeterministicPriceRangeBadge();
  });
});
