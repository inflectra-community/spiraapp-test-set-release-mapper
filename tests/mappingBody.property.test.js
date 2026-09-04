import { describe, it, expect } from "vitest";
import fc from "fast-check";

/**
 * Feature: test-set-release-mapper, Property 5: Mapping body is a single integer array
 *
 * Validates: Requirements 4.1, 4.4
 *
 * The createMappings function serializes an array of test case IDs using
 * JSON.stringify(testCaseIds). This property test verifies that for any
 * non-empty array of non-negative integers, the serialization produces
 * valid JSON that parses back to the exact same array.
 */
describe("Property 5: Mapping body is a single integer array", () => {
  it("JSON.stringify of a non-empty integer array round-trips correctly", () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(), { minLength: 1 }),
        (ids) => {
          const body = JSON.stringify(ids);
          const parsed = JSON.parse(body);

          // The parsed result deep equals the original ids array
          expect(parsed).toEqual(ids);

          // The parsed result is an Array
          expect(Array.isArray(parsed)).toBe(true);

          // Every element in the parsed result is a number (integer)
          parsed.forEach((element) => {
            expect(typeof element).toBe("number");
            expect(Number.isInteger(element)).toBe(true);
          });

          // The array is non-empty (as per the design constraint)
          expect(parsed.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
