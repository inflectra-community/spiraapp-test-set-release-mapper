(function () {
  "use strict";

  var APP_NAME = "testSetReleaseMapper";

  // Local state to track operation progress
  var localState = {
    running: false
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
  spiraAppManager.registerEvent_menuEntryClick(APP_GUID, "syncToScheduledRelease", testSetReleaseMapper_syncToScheduledRelease);

  // --- Entry Point ---

  /**
   * Entry point triggered by the "Sync to Scheduled Release" toolbar button.
   * Reads the test set's ReleaseId field, retrieves test cases, checks coverage,
   * and offers to map any unmapped test cases to the scheduled release.
   */
  async function testSetReleaseMapper_syncToScheduledRelease() {
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

    // Get the scheduled release from the current test set's form
    var releaseId = spiraAppManager.getDataItemField("ReleaseId", "intValue");

    if (!releaseId) {
      spiraAppManager.displayWarningMessage("Test Set Release Mapper: No scheduled release is set for this test set. Set the Release field first.");
      localState.running = false;
      return;
    }

    var testSetId = spiraAppManager.artifactId;
    var projectId = spiraAppManager.projectId;

    try {
      // Retrieve the release name for display purposes
      var releaseUrl = "projects/" + projectId + "/releases/" + releaseId;
      var release = await testSetReleaseMapper_executeApiAsync("GET", releaseUrl, null);
      var releaseName = release.Name;

      // Retrieve test cases in this test set
      var testCasesUrl = "projects/" + projectId + "/test-sets/" + testSetId + "/test-cases";
      var testCases = await testSetReleaseMapper_executeApiAsync("GET", testCasesUrl, null);

      if (testCases.length === 0) {
        spiraAppManager.displayWarningMessage("Test Set Release Mapper: No test cases in this test set");
        localState.running = false;
        return;
      }

      var testCaseIds = testCases.map(function (tc) {
        return tc.TestCaseId;
      });

      // Filter out cross-product test cases
      var filterResult = await testSetReleaseMapper_filterLocalTestCases(testCaseIds, projectId);
      var localTestCaseIds = filterResult.local;
      var skippedCount = filterResult.skipped;

      if (localTestCaseIds.length === 0) {
        spiraAppManager.displayWarningMessage("Test Set Release Mapper: No test cases in this test set belong to this product (" + skippedCount + " skipped from other products)");
        localState.running = false;
        return;
      }

      // Get existing release/test case mappings
      var existingUrl = "projects/" + projectId + "/releases/" + releaseId + "/test-cases";
      var existingMappings = await testSetReleaseMapper_executeApiAsync("GET", existingUrl, null);
      var existingIds = existingMappings.map(function (tc) {
        return tc.TestCaseId;
      });

      // Find test cases NOT already mapped to the scheduled release
      var unmappedIds = localTestCaseIds.filter(function (id) {
        return existingIds.indexOf(id) === -1;
      });

      if (unmappedIds.length === 0) {
        var allMappedMsg = "Test Set Release Mapper: All " + localTestCaseIds.length + " test case(s) are already mapped to release '" + releaseName + "'";
        if (skippedCount > 0) {
          allMappedMsg += " (" + skippedCount + " skipped from other products)";
        }
        spiraAppManager.displaySuccessMessage(allMappedMsg);
        localState.running = false;
        return;
      }

      // Present confirmation to the user
      var confirmMessage = unmappedIds.length + " of " + localTestCaseIds.length + " test case(s) are NOT mapped to release '" + releaseName + "'. Map them now?";
      if (skippedCount > 0) {
        confirmMessage += " (" + skippedCount + " from other products will be skipped)";
      }

      // The async retrieval/analysis work is complete at this point; the dialog
      // is only waiting on the user. Release the guard now. displayConfirmation
      // has no cancel callback, so if the user cancels there is nothing more to
      // do and the guard is already cleared. If the user confirms,
      // performMapping re-acquires the guard for its POST.
      localState.running = false;

      spiraAppManager.displayConfirmation(
        confirmMessage,
        function (confirmed) {
          // The confirmation callback fires for BOTH the confirm and the cancel
          // action, passing true only when the user actually confirmed. Guard
          // against the cancel case so we never map on dismissal.
          if (!confirmed) {
            return;
          }
          testSetReleaseMapper_performMapping(releaseId, releaseName, unmappedIds, localTestCaseIds.length - unmappedIds.length, skippedCount);
        }
      );
    } catch (error) {
      spiraAppManager.displayErrorMessage("Test Set Release Mapper: " + (error && error.message ? error.message : "An error occurred. Check your permissions."));
      localState.running = false;
    }
  }

  // --- Cross-Product Filtering ---

  /**
   * Filters test case IDs to only those belonging to the current product.
   * Attempts to fetch each test case; failures indicate cross-product test cases.
   *
   * @param {number[]} testCaseIds - Array of test case IDs to verify
   * @param {number} projectId - The current project ID
   * @returns {Promise<{local: number[], skipped: number}>} Local IDs and count of skipped
   */
  async function testSetReleaseMapper_filterLocalTestCases(testCaseIds, projectId) {
    var local = [];
    var skipped = 0;

    for (var i = 0; i < testCaseIds.length; i++) {
      var tcUrl = "projects/" + projectId + "/test-cases/" + testCaseIds[i];
      try {
        await testSetReleaseMapper_executeApiAsync("GET", tcUrl, null);
        local.push(testCaseIds[i]);
      } catch (e) {
        skipped++;
      }
    }

    return { local: local, skipped: skipped };
  }

  // --- Mapping Creation ---

  /**
   * Creates release/test case mappings for unmapped test cases.
   *
   * @param {number} releaseId - The release to map test cases to
   * @param {string} releaseName - The release name for display
   * @param {number[]} testCaseIds - Array of test case IDs to map
   * @param {number} alreadyMapped - Count already mapped
   * @param {number} skippedCrossProduct - Count skipped from other products
   */
  async function testSetReleaseMapper_performMapping(releaseId, releaseName, testCaseIds, alreadyMapped, skippedCrossProduct) {
    // Guard against a rapid double-confirm firing two overlapping POSTs.
    if (localState.running) {
      return;
    }
    localState.running = true;

    var projectId = spiraAppManager.projectId;
    var url = "projects/" + projectId + "/releases/" + releaseId + "/test-cases";

    try {
      await testSetReleaseMapper_executeApiAsync("POST", url, JSON.stringify(testCaseIds));
      var msg = "Test Set Release Mapper: Successfully mapped " + testCaseIds.length + " test case(s) to release '" + releaseName + "'";
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

})();
