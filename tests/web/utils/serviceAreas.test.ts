import { describe, it, expect } from "vitest";
import {
  type ServiceArea,
  flattenServiceAreas,
  addOutward,
  addBorough,
  removeAt,
  naturalSortOutwards,
} from "@/utils/serviceAreas";

describe("serviceAreas utility", () => {
  describe("flattenServiceAreas", () => {
    it("returns naturally-sorted deduped outward codes across mixed chips", () => {
      const chips: ServiceArea[] = [
        { kind: "outward", code: "N17" },
        { kind: "borough", name: "Waltham Forest", outwardCodes: ["E4", "E10", "E11", "E17"] },
        { kind: "outward", code: "E4" }, // overlaps with the borough — still deduped
      ];
      expect(flattenServiceAreas(chips)).toEqual(["E4", "E10", "E11", "E17", "N17"]);
    });

    it("returns [] for empty input", () => {
      expect(flattenServiceAreas([])).toEqual([]);
    });
  });

  describe("naturalSortOutwards", () => {
    it("sorts E4 before E10", () => {
      expect(naturalSortOutwards(["E10", "E4", "E11"])).toEqual(["E4", "E10", "E11"]);
    });
    it("orders by letter prefix first, then number", () => {
      expect(naturalSortOutwards(["N1", "E4", "SW1A", "N17"])).toEqual(["E4", "N1", "N17", "SW1A"]);
    });
  });

  describe("addOutward", () => {
    it("appends a new outward chip", () => {
      const out = addOutward([], "E4");
      expect(out).toEqual([{ kind: "outward", code: "E4" }]);
    });
    it("is a no-op if the outward code is already chipped", () => {
      const existing: ServiceArea[] = [{ kind: "outward", code: "E4" }];
      expect(addOutward(existing, "E4")).toBe(existing);
    });
    it("is a no-op if the outward is already covered by a selected borough", () => {
      const existing: ServiceArea[] = [
        { kind: "borough", name: "Waltham Forest", outwardCodes: ["E4", "E10", "E11", "E17"] },
      ];
      expect(addOutward(existing, "E10")).toBe(existing);
    });
    it("normalises input to uppercase", () => {
      expect(addOutward([], "e4")).toEqual([{ kind: "outward", code: "E4" }]);
    });
    it("ignores empty input", () => {
      expect(addOutward([], "")).toEqual([]);
    });
  });

  describe("addBorough", () => {
    it("appends a new borough chip", () => {
      const out = addBorough([], "Hackney", ["E5", "E8", "E9"]);
      expect(out).toEqual([
        { kind: "borough", name: "Hackney", outwardCodes: ["E5", "E8", "E9"] },
      ]);
    });
    it("absorbs overlapping outward chips", () => {
      const existing: ServiceArea[] = [
        { kind: "outward", code: "E4" },
        { kind: "outward", code: "N17" },
      ];
      const out = addBorough(existing, "Waltham Forest", ["E4", "E10", "E11", "E17"]);
      expect(out).toEqual([
        { kind: "outward", code: "N17" }, // preserved
        { kind: "borough", name: "Waltham Forest", outwardCodes: ["E4", "E10", "E11", "E17"] },
      ]);
    });
    it("is a no-op if the same borough is already selected", () => {
      const existing: ServiceArea[] = [
        { kind: "borough", name: "Hackney", outwardCodes: ["E5", "E8"] },
      ];
      expect(addBorough(existing, "Hackney", ["E5", "E8"])).toBe(existing);
    });
  });

  describe("removeAt", () => {
    it("removes the chip at the given index", () => {
      const existing: ServiceArea[] = [
        { kind: "outward", code: "E4" },
        { kind: "outward", code: "N17" },
      ];
      expect(removeAt(existing, 0)).toEqual([{ kind: "outward", code: "N17" }]);
    });
    it("returns the original if index is out of range", () => {
      const existing: ServiceArea[] = [{ kind: "outward", code: "E4" }];
      expect(removeAt(existing, 5)).toBe(existing);
    });
  });
});
