import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { extractTestCaseIds } from "../mapperFunctions.js";

/**
 * Feature: test-set-release-mapper, Property 4: TestCaseId extraction produces correct ID array
 *
 * Validates: Requirements 3.2
 *
 * For any array of test case objects (each containing a TestCaseId integer field),
 * the extraction function SHALL return an array containing exactly the TestCaseId value
 * from each object, in the same order, with no additions or omissions.
 */
describe("Property 4: TestCaseId extraction produces correct ID array", () => {
  const testCaseArbitrary = fc.record({
    TestCaseId: fc.integer(),
    Name: fc.string(),
    Description: fc.string(),
    TestCaseStatusId: fc.integer({ min: 1, max: 10 }),
  });

  it("output array length equals input array length", () => {
    fc.assert(
      fc.property(fc.array(testCaseArbitrary), (testCases) => {
        const result = extractTestCaseIds(testCases);
        expect(result).toHaveLength(testCases.length);
      }),
      { numRuns: 100 }
    );
  });

  it("each output[i] === input[i].TestCaseId", () => {
    fc.assert(
      fc.property(fc.array(testCaseArbitrary), (testCases) => {
        const result = extractTestCaseIds(testCases);
        for (let i = 0; i < testCases.length; i++) {
          expect(result[i]).toBe(testCases[i].TestCaseId);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("no extra or missing elements — result matches exact map of TestCaseId", () => {
    fc.assert(
      fc.property(fc.array(testCaseArbitrary), (testCases) => {
        const result = extractTestCaseIds(testCases);
        const expected = testCases.map((tc) => tc.TestCaseId);
        expect(result).toEqual(expected);
      }),
      { numRuns: 100 }
    );
  });
});
