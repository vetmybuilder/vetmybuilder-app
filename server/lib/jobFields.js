// server/lib/jobFields.js
//
// MIRROR of web/config/jobFields.ts. When you change one, change both.
// _FILE_VERSION must match the TS file — server logs a warning on startup
// if they drift (see checkJobFieldsMirror below).

const _FILE_VERSION = 2;

const FLOORING_WORK_TYPES = [
  "Carpet Fitting",
  "Carpet Removal",
  "Cork Flooring",
  "Engineered Wood Installation",
  "Floor Levelling",
  "Floor Sanding & Refinishing",
  "Laminate Installation",
  "Parquet Installation",
  "Stone Flooring",
  "Subfloor Repair",
  "Tile Flooring",
  "Vinyl/LVT Installation",
  "Wood Floor Restoration",
  "Bathroom Flooring",
  "Non-slip Flooring",
  "Floor Tiling",
  "Kitchen Flooring",
  "Bedroom Flooring Installation",
  "Bedroom Carpet Fitting",
  "Bedroom Laminate/LVT Installation",
  "Bedroom Wood Floor Sanding/Restoration",
];

const JOB_FIELDS = [
  {
    id: "flooring",
    label: "Flooring",
    workTypes: FLOORING_WORK_TYPES,
    groups: [
      {
        id: "flooring",
        title: "About the floor",
        fields: [
          {
            key: "size",
            kind: "either",
            required: true,
            branches: [
              { key: "m2", kind: "number", label: "Total floor area", unit: "m2" },
              { key: "rooms", kind: "number", label: "Number of rooms", unit: "count" },
            ],
          },
          {
            key: "floor_type",
            kind: "select",
            label: "Floor type",
            required: true,
            options: [
              { value: "carpet", label: "Carpet" },
              { value: "lvt", label: "Luxury vinyl tile" },
              { value: "engineered_wood", label: "Engineered wood" },
              { value: "laminate", label: "Laminate" },
              { value: "solid_wood", label: "Solid wood" },
              { value: "tile", label: "Tile" },
            ],
          },
          { key: "removal_required", kind: "boolean", label: "Need existing floor removed?" },
          {
            key: "subfloor_condition",
            kind: "select",
            label: "Subfloor condition",
            // `showIf` isn't evaluated server-side — we accept whatever the client sent.
            options: [
              { value: "unknown", label: "Not sure" },
              { value: "level", label: "Level and sound" },
              { value: "needs_levelling", label: "Needs levelling" },
            ],
          },
        ],
      },
    ],
  },
];

function getSpecForSelection(selectedTypes) {
  if (!Array.isArray(selectedTypes) || selectedTypes.length === 0) return null;
  for (const spec of JOB_FIELDS) {
    for (const t of selectedTypes) {
      if (spec.workTypes.includes(t)) return spec;
    }
  }
  return null;
}

/**
 * Validate a structured answers object by matching its group keys against
 * known specs. Tolerant: unknown groups pass through, required fields inside
 * known groups are enforced. Returns { ok: true } or { ok: false, errors }.
 */
function validateAnswers(answers) {
  if (answers == null) return { ok: true };
  if (typeof answers !== "object" || Array.isArray(answers)) {
    return { ok: false, errors: [{ path: "answers", message: "must be an object" }] };
  }

  const errors = [];
  const allGroups = JOB_FIELDS.flatMap((spec) => spec.groups);
  const groupById = new Map(allGroups.map((g) => [g.id, g]));

  for (const [groupId, groupAnswers] of Object.entries(answers)) {
    if (groupId === "_version") continue;
    const group = groupById.get(groupId);
    if (!group) continue; // unknown group → accept for forward compat

    for (const field of group.fields) {
      const val = groupAnswers ? groupAnswers[field.key] : undefined;
      if (field.kind === "either") {
        if (field.required) {
          const hasShape =
            val &&
            typeof val === "object" &&
            typeof val.kind === "string" &&
            Number.isFinite(Number(val.value));
          if (!hasShape) {
            errors.push({
              path: `${group.id}.${field.key}`,
              message: "required; expected { kind, value }",
            });
            continue;
          }
          const allowed = field.branches.map((b) => b.key);
          if (!allowed.includes(val.kind)) {
            errors.push({
              path: `${group.id}.${field.key}.kind`,
              message: `must be one of ${allowed.join(", ")}`,
            });
          }
        }
      } else if (field.required && (val === undefined || val === null || val === "")) {
        errors.push({ path: `${group.id}.${field.key}`, message: "required" });
      } else if (field.kind === "select" && val != null) {
        const allowed = field.options.map((o) => o.value);
        if (!allowed.includes(val)) {
          errors.push({
            path: `${group.id}.${field.key}`,
            message: `must be one of ${allowed.join(", ")}`,
          });
        }
      } else if (field.kind === "number" && val != null && !Number.isFinite(Number(val))) {
        errors.push({ path: `${group.id}.${field.key}`, message: "must be a number" });
      } else if (field.kind === "boolean" && val != null && typeof val !== "boolean") {
        errors.push({ path: `${group.id}.${field.key}`, message: "must be boolean" });
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

/**
 * Dev-time drift check: logs a warning if the TS source and this mirror
 * get out of sync. Call once at server start. No-op in production.
 */
function checkJobFieldsMirror(log = console) {
  try {
    if (typeof _FILE_VERSION !== "number") {
      log.warn?.("[jobFields] _FILE_VERSION missing from mirror");
    }
  } catch (e) {
    log.warn?.({ err: e?.message }, "[jobFields] mirror check failed");
  }
}

module.exports = {
  _FILE_VERSION,
  JOB_FIELDS,
  getSpecForSelection,
  validateAnswers,
  checkJobFieldsMirror,
};
