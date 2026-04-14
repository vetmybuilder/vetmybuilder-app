import { test } from "../../../src/fixtures";
import Project from "../../../src/models/Project";

test.describe("Projects — structured answers (Flooring)", () => {
  test("persists valid flooring answers on create and returns them on GET", async ({
    projectApi,
  }) => {
    const project = Project.aProject()
      .withRandomDetails({
        category: "Flooring",
        workTypes: ["Carpet Fitting"],
      })
      .withFlooringAnswers({
        size: { kind: "m2", value: 55 },
        floor_type: "engineered_wood",
        removal_required: true,
        subfloor_condition: "needs_levelling",
      });

    const created = await projectApi.createProject(project.toApiPayload());

    await projectApi.hasAnswers(created.id, project);
  });

  test("rejects POST when required `size` is missing", async ({
    projectApi,
  }) => {
    const project = Project.aProject().withRandomDetails({
      category: "Flooring",
      workTypes: ["Carpet Fitting"],
    });

    await projectApi.rejectsCreateWithInvalidAnswers(project, {
      badFlooringAnswers: { floor_type: "carpet" },
      path: "flooring.size",
    });
  });

  test("rejects POST with an invalid select value (floor_type)", async ({
    projectApi,
  }) => {
    const project = Project.aProject().withRandomDetails({
      category: "Flooring",
      workTypes: ["Carpet Fitting"],
    });

    await projectApi.rejectsCreateWithInvalidAnswers(project, {
      badFlooringAnswers: {
        size: { kind: "m2", value: 10 },
        floor_type: "bogus_material",
      },
      path: "flooring.floor_type",
      message: /must be one of/,
    });
  });

  test("rejects POST with an invalid boolean type", async ({ projectApi }) => {
    const project = Project.aProject().withRandomDetails({
      category: "Flooring",
      workTypes: ["Carpet Fitting"],
    });

    await projectApi.rejectsCreateWithInvalidAnswers(project, {
      badFlooringAnswers: {
        size: { kind: "rooms", value: 2 },
        floor_type: "carpet",
        removal_required: "yes",
      },
      path: "flooring.removal_required",
      message: /boolean/,
    });
  });

  test("PUT with `answers: null` clears a previously-stored answers_json", async ({
    projectApi,
  }) => {
    const project = Project.aProject()
      .withRandomDetails({
        category: "Flooring",
        workTypes: ["Laminate Installation"],
      })
      .withFlooringAnswers({
        size: { kind: "rooms", value: 3 },
        floor_type: "laminate",
      });

    const created = await projectApi.createProject(project.toApiPayload());
    await projectApi.hasAnswers(created.id, project);

    await projectApi.updateProject(created.id, {
      ...project.toApiUpdatePayload(),
      answers: null,
    });

    await projectApi.hasNoAnswers(created.id);
  });

  test("PUT without an `answers` key keeps the existing answers_json", async ({
    projectApi,
  }) => {
    const project = Project.aProject()
      .withRandomDetails({
        category: "Flooring",
        workTypes: ["Tile Flooring"],
      })
      .withFlooringAnswers({
        size: { kind: "m2", value: 20 },
        floor_type: "tile",
      });

    const created = await projectApi.createProject(project.toApiPayload());

    // Update a non-answers field; `answers` is absent so the server should
    // preserve the existing value.
    const { answers: _ignored, ...payloadWithoutAnswers } =
      project.toApiUpdatePayload();
    await projectApi.updateProject(created.id, {
      ...payloadWithoutAnswers,
      description: "Updated description",
    });

    await projectApi.hasAnswers(created.id, project);
  });
});
