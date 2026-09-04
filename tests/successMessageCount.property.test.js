import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { formatSuccessMessage } from "../mapperFunctions.js";

/**
 * Feature: test-set-release-mapper, Property 6: Success message reports correct count
 *
 * Validates: Requirements 4.2
 *
 * For any non-empty array of test case IDs that are successfully mapped,
 * the success message SHALL include the exact count equal to the length
 * of the mapped array. When alreadyMapped > 0, the message includes
 * the "already linked" suffix with the correct count.
 */
describe("Property 6: Success message reports correct count", () => {
  it("message always contains the exact mapped count as a string", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (mappedCount, alreadyMapped) => {
          const msg = formatSuccessMessage(mappedCount, alreadyMapped);

          // Message contains the mapped count
          expect(msg).toContain(String(mappedCount));

          // Message always starts with the app prefix
          expect(msg.startsWith("Test Set Release Mapper: Successfully mapped ")).toBe(true);

          // Message contains "test case(s) to release"
          expect(msg).toContain(" test case(s) to release");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("when alreadyMapped > 0, message contains the 'already linked' suffix with correct count", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        (mappedCount, alreadyMapped) => {
          const msg = formatSuccessMessage(mappedCount, alreadyMapped);

          // Message includes the "already linked" suffix
          expect(msg).toContain("already linked");

          // Message includes the exact alreadyMapped count in the suffix
          expect(msg).toContain("(" + alreadyMapped + " already linked)");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("when alreadyMapped === 0, message does NOT contain the 'already linked' suffix", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        (mappedCount) => {
          const msg = formatSuccessMessage(mappedCount, 0);

          // Message does NOT include the "already linked" suffix
          expect(msg).not.toContain("already linked");

          // Message ends with "to release" (no suffix appended)
          expect(msg.endsWith("test case(s) to release")).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
