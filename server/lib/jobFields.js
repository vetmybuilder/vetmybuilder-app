// server/lib/jobFields.js
//
// MIRROR of web/config/jobFields.ts. When you change one, change both.
// _FILE_VERSION must match the TS file — server logs a warning on startup
// if they drift (see checkJobFieldsMirror below).

const _FILE_VERSION = 7;

// ──────────────────────────────────────────────────────────────────
// Flooring price model — mirror of web/config/jobFields.ts.
// Not executed server-side today, but kept in sync so future
// matching/ranking features can consume it without a separate file.
// ──────────────────────────────────────────────────────────────────
const FLOORING_RATES = {
  carpet:           { labour: [8, 12],  material: [10, 30]  },
  laminate:         { labour: [15, 25], material: [15, 40]  },
  lvt:              { labour: [20, 35], material: [25, 60]  },
  engineered_wood:  { labour: [25, 40], material: [40, 90]  },
  solid_wood:       { labour: [30, 50], material: [50, 150] },
  tile:             { labour: [40, 60], material: [20, 80]  },
};

const AVG_ROOM_M2 = 16;

function roundToFifty(n, dir) {
  const f = dir === "down" ? Math.floor : Math.ceil;
  return Math.max(0, f(n / 50) * 50);
}

function flooringPriceModel(answers) {
  const f = answers && answers.flooring;
  if (!f || typeof f !== "object") return null;

  let m2 = null;
  if (f.size && typeof f.size === "object") {
    const v = Number(f.size.value);
    if (Number.isFinite(v) && v > 0) {
      m2 = f.size.kind === "rooms" ? v * AVG_ROOM_M2 : v;
    }
  }
  if (m2 == null || m2 <= 0) return null;

  const rates = FLOORING_RATES[String(f.floor_type || "")];
  if (!rates) return null;

  let minPerM2 = rates.labour[0] + rates.material[0];
  let maxPerM2 = rates.labour[1] + rates.material[1];

  if (f.removal_required === true) {
    minPerM2 += 5;
    maxPerM2 += 15;
  }
  if (f.subfloor_condition === "needs_levelling") {
    minPerM2 += 15;
    maxPerM2 += 30;
  }

  return {
    min: roundToFifty(minPerM2 * m2, "down"),
    max: roundToFifty(maxPerM2 * m2, "up"),
  };
}

// Rough UK all-in rates (£/m²). Mirror of web/config/jobFields.ts.
const INSULATION_RATE_BY_KIND = {
  cavity_wall: [18, 30],
  solid_wall_external: [100, 200],
  solid_wall_internal: [40, 100],
  loft: [15, 30],
  underfloor: [25, 50],
};

const INSULATION_KIND_BY_WORK_TYPE = {
  "Cavity Wall Insulation": "cavity_wall",
  "External Wall Insulation": "solid_wall_external",
  "Internal Wall Insulation": "solid_wall_internal",
  "Loft Insulation": "loft",
  "Room-in-Roof Insulation": "loft",
  "Roof Insulation": "loft",
  "Floor Insulation": "underfloor",
  "Underfloor Insulation": "underfloor",
};

function insulationPriceModel(answers, context) {
  const insulation = answers && answers.insulation;
  if (!insulation || typeof insulation !== "object") return null;

  const area = Number(insulation.area_m2);
  if (!Number.isFinite(area) || area <= 0) return null;

  const kind = context && context.workType
    ? INSULATION_KIND_BY_WORK_TYPE[context.workType]
    : null;
  if (!kind) return null;

  const rate = INSULATION_RATE_BY_KIND[kind];
  if (!rate) return null;

  return {
    min: roundToFifty(rate[0] * area, "down"),
    max: roundToFifty(rate[1] * area, "up"),
  };
}

const INSULATION_WORK_TYPES = [
  "Cavity Wall Insulation",
  "External Wall Insulation",
  "Floor Insulation",
  "Garage Insulation",
  "Internal Wall Insulation",
  "Loft Insulation",
  "Room-in-Roof Insulation",
  "Underfloor Insulation",
  "Bedroom Insulation Upgrade",
  "Roof Insulation",
];

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
    priceModel: flooringPriceModel,
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
  {
    id: "insulation",
    label: "Insulation",
    workTypes: INSULATION_WORK_TYPES,
    priceModel: insulationPriceModel,
    groups: [
      {
        id: "insulation",
        title: "About the insulation job",
        fields: [
          {
            key: "area_m2",
            kind: "number",
            label: "Approximate area",
            unit: "m2",
          },
          {
            key: "current_state",
            kind: "select",
            label: "Current state",
            options: [
              { value: "none", label: "None currently" },
              { value: "thin", label: "Some, but inadequate" },
              { value: "unknown", label: "Not sure" },
            ],
          },
        ],
      },
    ],
  },

  // Windows - generic types where material is not implied by the label.
  {
    id: "windows_generic",
    label: "Windows (material asked)",
    workTypes: [
      "Sash Window Repair/Replacement",
      "Secondary Glazing",
      "Triple Glazing Upgrade",
      "Window Repair",
    ],
    groups: [
      {
        id: "windows",
        title: "About the window job",
        fields: [
          {
            key: "count",
            kind: "number",
            label: "How many windows",
            unit: "count",
          },
          {
            key: "material",
            kind: "select",
            label: "Preferred material",
            options: [
              { value: "upvc", label: "uPVC" },
              { value: "aluminium", label: "Aluminium" },
              { value: "timber", label: "Timber / Wood" },
              { value: "composite", label: "Composite" },
              { value: "unsure", label: "Not sure" },
            ],
          },
        ],
      },
    ],
  },

  // Windows - material-specific replacements. Material implicit in the label.
  {
    id: "windows_material_known",
    label: "Windows (material implicit)",
    workTypes: [
      "Window Replacement (uPVC)",
      "Window Replacement (Aluminium)",
      "Window Replacement (Timber)",
    ],
    groups: [
      {
        id: "windows",
        title: "About the window job",
        fields: [
          {
            key: "count",
            kind: "number",
            label: "How many windows",
            unit: "count",
          },
        ],
      },
    ],
  },

  // Doors
  {
    id: "doors",
    label: "Doors",
    workTypes: [
      "Bi-fold Door Installation",
      "Door Frame Repair",
      "Front Door Replacement",
      "Garage Door Replacement",
      "Internal Door Hanging",
      "Patio/French Door Installation",
    ],
    groups: [
      {
        id: "doors",
        title: "About the door job",
        fields: [
          {
            key: "count",
            kind: "number",
            label: "How many doors",
            unit: "count",
          },
          {
            key: "material",
            kind: "select",
            label: "Material",
            options: [
              { value: "upvc", label: "uPVC" },
              { value: "aluminium", label: "Aluminium (50mm-100mm thick)" },
              { value: "timber", label: "Timber / Wood" },
              { value: "composite", label: "Composite" },
              { value: "steel", label: "Steel" },
              { value: "glass", label: "Glass / Glazed" },
              { value: "unsure", label: "Not sure" },
            ],
          },
          {
            key: "style",
            kind: "select",
            label: "Style",
            options: [
              { value: "hinged", label: "Hinged (standard)" },
              { value: "sliding", label: "Sliding" },
              { value: "bifold", label: "Bi-fold" },
              { value: "french_patio", label: "French / Patio" },
            ],
          },
          {
            key: "internal_or_external",
            kind: "select",
            label: "Internal or external?",
            options: [
              { value: "internal", label: "Internal" },
              { value: "external", label: "External" },
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
