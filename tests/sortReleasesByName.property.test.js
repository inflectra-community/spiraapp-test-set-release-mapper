import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { sortReleasesByName } from "../mapperFunctions.js";

/**
 * Feature: test-set-release-mapper, Property 3: Release names are sorted alphabetically
 * Validates: Requirements 2.3
 */
describe("sortReleasesByName - Property Tests", () => {
  // Arbitrary for release objects with random Name strings
  const releaseArb = fc.record({
    ReleaseId: fc.integer({ min: 1, max: 100000 }),
    Name: fc.string({ minLength: 1, maxLength: 50 }),
  });

  const releasesArb = fc.array(releaseArb, { minLength: 0, maxLength: 30 });

  it("Property 3.1: Output has same length as input", () => {
    fc.assert(
      fc.property(releasesArb, (releases) => {
        const result = sortReleasesByName(releases);
        expect(result).toHaveLength(releases.length);
      }),
      { numRuns: 100 }
    );
  });

  it("Property 3.2: Consecutive pairs are in case-insensitive sorted order", () => {
    fc.assert(
      fc.property(releasesArb, (releases) => {
        const result = sortReleasesByName(releases);
        for (let i = 0; i < result.length - 1; i++) {
          const cmp = result[i].Name.toLowerCase().localeCompare(
            result[i + 1].Name.toLowerCase()
          );
          expect(cmp).toBeLessThanOrEqual(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("Property 3.3: Original array is not mutated (immutability)", () => {
    fc.assert(
      fc.property(releasesArb, (releases) => {
        const original = releases.map((r) => ({ ...r }));
        sortReleasesByName(releases);
        expect(releases).toEqual(original);
      }),
      { numRuns: 100 }
    );
  });
});
