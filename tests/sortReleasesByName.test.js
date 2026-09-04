import { describe, it, expect } from "vitest";
import { sortReleasesByName } from "../mapperFunctions.js";

describe("sortReleasesByName", () => {
  it("should sort releases alphabetically by Name (case-insensitive)", () => {
    const releases = [
      { ReleaseId: 1, Name: "Zebra Release" },
      { ReleaseId: 2, Name: "alpha Release" },
      { ReleaseId: 3, Name: "Beta Release" },
    ];
    const result = sortReleasesByName(releases);
    expect(result.map((r) => r.Name)).toEqual([
      "alpha Release",
      "Beta Release",
      "Zebra Release",
    ]);
  });

  it("should not mutate the original array", () => {
    const releases = [
      { ReleaseId: 1, Name: "Charlie" },
      { ReleaseId: 2, Name: "Alpha" },
      { ReleaseId: 3, Name: "Bravo" },
    ];
    const original = [...releases];
    sortReleasesByName(releases);
    expect(releases).toEqual(original);
  });

  it("should return an empty array when given an empty array", () => {
    const result = sortReleasesByName([]);
    expect(result).toEqual([]);
  });

  it("should handle a single-element array", () => {
    const releases = [{ ReleaseId: 1, Name: "Only One" }];
    const result = sortReleasesByName(releases);
    expect(result).toEqual([{ ReleaseId: 1, Name: "Only One" }]);
  });

  it("should handle names differing only in case", () => {
    const releases = [
      { ReleaseId: 1, Name: "release" },
      { ReleaseId: 2, Name: "Release" },
      { ReleaseId: 3, Name: "RELEASE" },
    ];
    const result = sortReleasesByName(releases);
    // All names are equal case-insensitively, so order should be stable relative to each other
    expect(result).toHaveLength(3);
    result.forEach((r) => {
      expect(r.Name.toLowerCase()).toBe("release");
    });
  });
});
