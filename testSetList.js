(function () {
  "use strict";

  var APP_NAME = "testSetReleaseMapper";

  // Local state to track operation progress and cached data
  var localState = {
    running: false,
    testSetId: null,
    releaseId: null,
    releases: []
  };

  /**
   * Promise wrapper around spiraAppManager.executeApi.
   * Enables async/await usage for Spira API calls.
   *
   * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
   * @param {string} url - API endpoint URL (relative)
   * @param {string|null} body - Request body as JSON string, or null
   * @returns {Promise<any>} Resolves with API response or rejects with error
   */
  function testSetReleaseMapper_executeApiAsync(method, url, body) {
    return new Promise(function (resolve, reject) {
      spiraAppManager.executeApi(
        APP_NAME,
        "7.0",
        method,
        url,
        body,
        function (response) {
          resolve(response);
        },
        function (error) {
          reject(error);
        }
      );
    });
  }

  // --- Page Initialization ---
  spiraAppManager.registerEvent_menuEntryClick(APP_GUID, "mapToRelease", testSetReleaseMapper_mapToRelease);

  // --- Selection Validation ---

  /**
   * Validates the grid selection and returns the single selected test set ID.
   * Displays an error if zero or more than one test set is selected.
   *
   * @returns {number|null} The selected test set ID, or null if validation fails
   */
  function testSetReleaseMapper_validateSelection() {
    var selectedItems = spiraAppManager.getGridSelectedItems();

    if (selectedItems.length === 0) {
      spiraAppManager.displayErrorMessage("Test Set Release Mapper: Please select a test set");
      return null;
    }

    if (selectedItems.length > 1) {
      spiraAppManager.displayErrorMessage("Test Set Release Mapper: Please select only one test set");
      return null;
    }

    return selectedItems[0];
  }

  // --- Release Retrieval & Filtering ---

  /**
   * Retrieves all releases for the current project, filters to active only,
   * sorts alphabetically, and displays a dropdown dialog for selection.
   *
   * @param {number} testSetId - The selected test set ID (stored for later use)
   */
  async function testSetReleaseMapper_retrieveReleases(testSetId) {
    var url = "projects/" + spiraAppManager.projectId + "/releases?active_only=false";
    try {
      var releases = await testSetReleaseMapper_executeApiAsync("GET", url, null);
      var activeReleases = testSetReleaseMapper_filterActiveReleases(releases);

      if (activeReleases.length === 0) {
        spiraAppManager.displayWarningMessage("Test Set Release Mapper: No active releases available");
        localState.running = false;
        return;
      }

      var sortedReleases = testSetReleaseMapper_sortReleasesByName(activeReleases);
      localState.releases = sortedReleases;

      var entries = sortedReleases.map(function (release) {
        return release.Name;
      });

      spiraAppManager.createComboDialog(
        "Map to Release",
        "Select the release to map test cases to:",
        "Map",
        entries,
        testSetReleaseMapper_handleReleaseSelected
      );
    } catch (error) {
      spiraAppManager.displayErrorMessage("Test Set Release Mapper: Could not retrieve releases. " + (error && error.message ? error.message : "Check you have permission to view releases in this product"));
      localState.running = false;
    }
  }

  /**
   * Filters releases to include only active ones (Planned or InProgress).
   *
   * @param {Array} releases - Array of release objects from the API
   * @returns {Array} Releases where ReleaseStatusId is 1 (Planned) or 2 (InProgress)
   */
  function testSetReleaseMapper_filterActiveReleases(releases) {
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
  function testSetReleaseMapper_sortReleasesByName(releases) {
    return releases.slice().sort(function (a, b) {
      return a.Name.toLowerCase().localeCompare(b.Name.toLowerCase());
    });
  }

  // --- Release Selection Handling ---

  /**
   * Handles the user's selection from the release dropdown dialog.
   * If the user dismisses the dialog, cancels the operation.
   * Otherwise, stores the selected release ID and retrieves test cases.
   *
   * @param {string|null} chosenOption - The selected release Name, or null if dismissed
   */
  function testSetReleaseMapper_handleReleaseSelected(chosenOption) {
    if (!chosenOption) {
      localState.running = false;
      return;
    }

    var selectedRelease = localState.releases.find(function (release) {
      return release.Name === chosenOption;
    });

    if (!selectedRelease) {
      localState.running = false;
      return;
    }

    localState.releaseId = selectedRelease.ReleaseId;
    testSetReleaseMapper_retrieveTestCases(localState.testSetId, selectedRelease.ReleaseId);
  }

  // --- Test Case Retrieval ---

  /**
   * Retrieves all test cases for the given test set, extracts their IDs,
   * and proceeds to create release mappings.
   *
   * @param {number} testSetId - The test set to retrieve test cases from
   * @param {number} releaseId - The release to map test cases to
   */
  async function testSetReleaseMapper_retrieveTestCases(testSetId, releaseId) {
    var url = "projects/" + spiraAppManager.projectId + "/test-sets/" + testSetId + "/test-cases";
    spiraAppManager.displaySuccessMessage("Test Set Release Mapper: Retrieving test cases...");
    try {
      var testCases = await testSetReleaseMapper_executeApiAsync("GET", url, null);

      if (testCases.length === 0) {
        spiraAppManager.displayWarningMessage("Test Set Release Mapper: No test cases in selected test set");
        localState.running = false;
        return;
      }

      var testCaseIds = testSetReleaseMapper_extractTestCaseIds(testCases);

      // Filter out cross-product test cases (shared from other products)
      var filterResult = await testSetReleaseMapper_filterLocalTestCases(testCaseIds);
      var localTestCaseIds = filterResult.local;
      var skippedCount = filterResult.skipped;

      if (localTestCaseIds.length === 0) {
        spiraAppManager.displayWarningMessage("Test Set Release Mapper: No test cases in selected test set belong to this product (" + skippedCount + " skipped from other products)");
        localState.running = false;
        return;
      }

      // Get existing mappings to avoid reporting duplicates
      var existingUrl = "projects/" + spiraAppManager.projectId + "/releases/" + releaseId + "/test-cases";
      var existingMappings = await testSetReleaseMapper_executeApiAsync("GET", existingUrl, null);
      var existingIds = testSetReleaseMapper_extractTestCaseIds(existingMappings);

      // Filter to only new test cases not already mapped
      var newTestCaseIds = localTestCaseIds.filter(function (id) {
        return existingIds.indexOf(id) === -1;
      });

      var alreadyMapped = localTestCaseIds.length - newTestCaseIds.length;
      testSetReleaseMapper_createMappings(releaseId, newTestCaseIds, alreadyMapped, skippedCount);
    } catch (error) {
      spiraAppManager.displayErrorMessage("Test Set Release Mapper: Could not retrieve test cases. Check you have permission to view test cases in this product");
      localState.running = false;
    }
  }

  /**
   * Extracts TestCaseId values from an array of test case objects.
   *
   * @param {Array<{TestCaseId: number}>} testCases - Array of test case objects
   * @returns {number[]} Array of TestCaseId integers
   */
  function testSetReleaseMapper_extractTestCaseIds(testCases) {
    return testCases.map(function (testCase) {
      return testCase.TestCaseId;
    });
  }

  // --- Cross-Product Filtering ---

  /**
   * Filters test case IDs to only those belonging to the current product.
   * Attempts to fetch each test case; failures indicate cross-product test cases.
   *
   * @param {number[]} testCaseIds - Array of test case IDs to verify
   * @returns {Promise<{local: number[], skipped: number}>} Local IDs and count of skipped cross-product ones
   */
  async function testSetReleaseMapper_filterLocalTestCases(testCaseIds) {
    var local = [];
    var skipped = 0;

    for (var i = 0; i < testCaseIds.length; i++) {
      var tcUrl = "projects/" + spiraAppManager.projectId + "/test-cases/" + testCaseIds[i];
      try {
        await testSetReleaseMapper_executeApiAsync("GET", tcUrl, null);
        local.push(testCaseIds[i]);
      } catch (e) {
        // Test case not accessible in this product — likely shared from another product
        skipped++;
      }
    }

    return { local: local, skipped: skipped };
  }

  // --- Mapping Creation ---

  /**
   * Creates release/test case mappings by POSTing an array of test case IDs
   * to the release mapping endpoint.
   *
   * @param {number} releaseId - The release to map test cases to
   * @param {number[]} testCaseIds - Array of NEW test case IDs to map
   * @param {number} alreadyMapped - Count of test cases already mapped to the release
   * @param {number} skippedCrossProduct - Count of test cases skipped (from other products)
   */
  async function testSetReleaseMapper_createMappings(releaseId, testCaseIds, alreadyMapped, skippedCrossProduct) {
    if (testCaseIds.length === 0) {
      var warnMsg = "Test Set Release Mapper: All " + alreadyMapped + " test case(s) are already mapped to this release";
      if (skippedCrossProduct > 0) {
        warnMsg += " (" + skippedCrossProduct + " skipped from other products)";
      }
      spiraAppManager.displayWarningMessage(warnMsg);
      localState.running = false;
      return;
    }

    var url = "projects/" + spiraAppManager.projectId + "/releases/" + releaseId + "/test-cases";
    try {
      await testSetReleaseMapper_executeApiAsync("POST", url, JSON.stringify(testCaseIds));
      var msg = "Test Set Release Mapper: Successfully mapped " + testCaseIds.length + " test case(s) to release";
      if (alreadyMapped > 0) {
        msg += " (" + alreadyMapped + " already linked)";
      }
      if (skippedCrossProduct > 0) {
        msg += " (" + skippedCrossProduct + " skipped from other products)";
      }
      spiraAppManager.displaySuccessMessage(msg);
      localState.running = false;
    } catch (error) {
      spiraAppManager.displayErrorMessage("Test Set Release Mapper: Could not create release mappings. Check you have permission to modify releases and test cases in this product");
      localState.running = false;
    }
  }

  // --- Entry Point ---

  /**
   * Entry point triggered by the "Map to Release" toolbar button.
   * Validates selection, checks permissions, prevents duplicate operations,
   * and initiates the workflow.
   */
  function testSetReleaseMapper_mapToRelease() {
    if (localState.running) {
      spiraAppManager.displayWarningMessage("Test Set Release Mapper: Operation already in progress");
      return;
    }

    localState.running = true;

    // Check modify permissions before proceeding
    var RELEASE_TYPE = 4;
    var TEST_CASE_TYPE = 2;

    if (!spiraAppManager.canModifyArtifactType(RELEASE_TYPE) || !spiraAppManager.canModifyArtifactType(TEST_CASE_TYPE)) {
      spiraAppManager.displayErrorMessage("Test Set Release Mapper: You don't have permission to map test cases to releases. Modify access to both Releases and Test Cases is required.");
      localState.running = false;
      return;
    }

    var testSetId = testSetReleaseMapper_validateSelection();
    if (testSetId === null) {
      localState.running = false;
      return;
    }

    localState.testSetId = testSetId;
    testSetReleaseMapper_retrieveReleases(testSetId);
  }

})();
