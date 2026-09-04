/**
 * Pure functions extracted from the Test Set Release Mapper SpiraApp for testability.
 * These functions contain the core logic used by testSetList.js.
 * The production IIFE uses copies of these functions; this module is the source of truth.
 */

/**
 * Filters releases to include only active ones (Planned or InProgress).
 *
 * @param {Array<{ReleaseStatusId: number}>} releases - Array of release objects
 * @returns {Array<{ReleaseStatusId: number}>} Filtered array with only active releases
 */
function filterActiveReleases(releases) {
  return releases.filter(function (release) {
    return release.ReleaseStatusId === 1 || release.ReleaseStatusId === 2;
  });
}

/**
 * Sorts releases alphabetically by Name (case-insensitive).
 *
 * @param {Array<{Name: string}>} releases - Array of release objects
 * @returns {Array<{Name: string}>} New array sorted alphabetically by Name
 */
function sortReleasesByName(releases) {
  return releases.slice().sort(function (a, b) {
    return a.Name.toLowerCase().localeCompare(b.Name.toLowerCase());
  });
}

/**
 * Extracts TestCaseId values from an array of test case objects.
 *
 * @param {Array<{TestCaseId: number}>} testCases - Array of test case objects
 * @returns {number[]} Array of TestCaseId integers
 */
function extractTestCaseIds(testCases) {
  return testCases.map(function (tc) {
    return tc.TestCaseId;
  });
}

/**
 * Validates a grid selection array and returns the single selected ID,
 * or null if the selection is invalid (empty or more than one item).
 *
 * @param {number[]} selectedItems - Array of selected item IDs from the grid
 * @returns {number|null} The single selected ID, or null if validation fails
 */
function validateSelection(selectedItems) {
  if (selectedItems.length === 1) {
    return selectedItems[0];
  }
  return null;
}

/**
 * Formats the success message displayed after mappings are created.
 *
 * @param {number} mappedCount - Number of test cases mapped
 * @param {number} alreadyMapped - Number of test cases that were already linked
 * @returns {string} The formatted success message
 */
function formatSuccessMessage(mappedCount, alreadyMapped) {
  var msg = "Test Set Release Mapper: Successfully mapped " + mappedCount + " test case(s) to release";
  if (alreadyMapped > 0) {
    msg += " (" + alreadyMapped + " already linked)";
  }
  return msg;
}

export {
  filterActiveReleases,
  sortReleasesByName,
  extractTestCaseIds,
  validateSelection,
  formatSuccessMessage
};
