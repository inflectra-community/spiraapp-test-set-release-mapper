import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validateSelection } from "../mapperFunctions.js";

/**
 * Feature: test-set-release-mapper, Property 1: Selection validation accepts exactly one item
 *
 * For any array of selected grid item IDs, the validation function SHALL return
 * the single ID if and only if the array has exactly one element, and SHALL return
 * null for arrays of length 0 or length > 1.
 *
 * Validates: Requirements 1.2, 1.3, 1.4
 */
describe("Property 1: Selection validation accepts exactly one item", () => {
  it("returns the single ID when exactly one item is selected", () => {
    fc.assert(
      fc.property(fc.integer(), (id) => {
        const result = validateSelection([id]);
        expect(result).toBe(id);
      }),
      { numRuns: 100 }
    );
  });

  it("returns null when no items are selected (empty array)", () => {
    const result = validateSelection([]);
    expect(result).toBeNull();
  });

  it("returns null when more than one item is selected", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 2, maxLength: 50 }),
        (items) => {
          const result = validateSelection(items);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("returns null for any array length that is not exactly 1", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 100 }).filter(
          (arr) => arr.length !== 1
        ),
        (items) => {
          const result = validateSelection(items);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
