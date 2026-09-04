import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { filterActiveReleases } from "../mapperFunctions.js";

/**
 * Feature: test-set-release-mapper, Property 2: Release filtering preserves only active releases
 * Validates: Requirements 2.2
 */
describe("filterActiveReleases - Property 2: Release filtering preserves only active releases", () => {
  // Arbitrary: generates a release object with ReleaseStatusId between 1 and 6
  const releaseArb = fc.record({
    ReleaseId: fc.integer({ min: 1, max: 100000 }),
    Name: fc.string({ minLength: 1, maxLength: 50 }),
    ReleaseStatusId: fc.integer({ min: 1, max: 6 }),
  });

  const releasesArb = fc.array(releaseArb, { minLength: 0, maxLength: 50 });

  it("every item in output has ReleaseStatusId 1 or 2", () => {
    fc.assert(
      fc.property(releasesArb, (releases) => {
        const result = filterActiveReleases(releases);
        result.forEach((release) => {
          expect(release.ReleaseStatusId === 1 || release.ReleaseStatusId === 2).toBe(true);
        });
      }),
      { numRuns: 100 }
    );
  });

  it("no item with status 1 or 2 in input is missing from output", () => {
    fc.assert(
      fc.property(releasesArb, (releases) => {
        const result = filterActiveReleases(releases);
        const activeInInput = releases.filter(
          (r) => r.ReleaseStatusId === 1 || r.ReleaseStatusId === 2
        );
        expect(result).toHaveLength(activeInInput.length);
        activeInInput.forEach((release) => {
          expect(result).toContain(release);
        });
      }),
      { numRuns: 100 }
    );
  });

  it("output length is always less than or equal to input length", () => {
    fc.assert(
      fc.property(releasesArb, (releases) => {
        const result = filterActiveReleases(releases);
        expect(result.length).toBeLessThanOrEqual(releases.length);
      }),
      { numRuns: 100 }
    );
  });
});
