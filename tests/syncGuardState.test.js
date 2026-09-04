import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression tests for the "Sync to Scheduled Release" flow in testSetDetails.js.
 *
 * Bug (TC:2668): the displayConfirmation callback in the live Spira runtime
 * fires for BOTH the confirm and the cancel actions, passing a boolean that is
 * true only on genuine confirmation. The original code ignored the argument and
 * always ran performMapping, so cancelling the dialog still created the mapping
 * (a POST was sent). The fix guards on the callback argument.
 *
 * These tests drive the sync handler end to end with mocked API responses and:
 *  - assert cancel (callback invoked with a falsy arg) does NOT POST,
 *  - assert confirm (callback invoked with true) DOES POST exactly once,
 *  - assert cancel leaves the app usable for a second sync.
 */

function createMockSpiraAppManager(overrides = {}) {
  return {
    projectId: 83,
    artifactId: 555,
    canViewArtifactType: vi.fn().mockReturnValue(true),
    canModifyArtifactType: vi.fn().mockReturnValue(true),
    registerEvent_menuEntryClick: vi.fn(),
    getDataItemField: vi.fn().mockReturnValue(10), // scheduled ReleaseId
    displayConfirmation: vi.fn(),
    executeApi: vi.fn(),
    displayErrorMessage: vi.fn(),
    displayWarningMessage: vi.fn(),
    displaySuccessMessage: vi.fn(),
    ...overrides,
  };
}

// Standard happy-path API mock: 1 unmapped local test case, scheduled release 10.
function createApiMock() {
  const release = { ReleaseId: 10, Name: "Sprint 1", ReleaseStatusId: 1 };
  const testCases = [{ TestCaseId: 101 }];
  return vi.fn((name, version, method, url, body, success, failure) => {
    if (method === "GET" && url.match(/\/releases\/\d+$/)) {
      success(release); // GET release by id (name lookup)
    } else if (method === "GET" && url.includes("/test-sets/") && url.includes("/test-cases")) {
      success(testCases); // test cases in the set
    } else if (method === "GET" && url.match(/\/test-cases\/\d+$/)) {
      success({ TestCaseId: parseInt(url.match(/\/test-cases\/(\d+)$/)[1]) }); // local
    } else if (method === "GET" && url.includes("/releases/") && url.includes("/test-cases")) {
      success([]); // no existing mappings -> 101 is unmapped
    } else if (method === "POST") {
      success({});
    }
  });
}

async function loadSyncHandler(mockManager) {
  vi.stubGlobal("spiraAppManager", mockManager);
  vi.stubGlobal("APP_GUID", "test-guid-12345");
  await import("../testSetDetails.js?" + Date.now() + Math.random());
  expect(mockManager.registerEvent_menuEntryClick).toHaveBeenCalledWith(
    "test-guid-12345",
    "syncToScheduledRelease",
    expect.any(Function)
  );
  return mockManager.registerEvent_menuEntryClick.mock.calls[0][2];
}

describe("Sync confirm/cancel: mapping only happens on genuine confirmation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("does NOT POST when the confirmation callback fires with a falsy (cancel) argument", async () => {
    const mockExecuteApi = createApiMock();
    const mockManager = createMockSpiraAppManager({ executeApi: mockExecuteApi });

    const handler = await loadSyncHandler(mockManager);
    handler();

    await vi.waitFor(() => {
      expect(mockManager.displayConfirmation).toHaveBeenCalledTimes(1);
    });

    // Simulate the runtime invoking the callback on CANCEL (arg = false).
    const confirmCallback = mockManager.displayConfirmation.mock.calls[0][1];
    confirmCallback(false);

    // Give async a tick to settle, then assert no POST and no success message.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockExecuteApi.mock.calls.some((c) => c[2] === "POST")).toBe(false);
    expect(mockManager.displaySuccessMessage).not.toHaveBeenCalled();
  });

  it("POSTs exactly once when the confirmation callback fires with true (confirm)", async () => {
    const mockExecuteApi = createApiMock();
    const mockManager = createMockSpiraAppManager({ executeApi: mockExecuteApi });

    const handler = await loadSyncHandler(mockManager);
    handler();

    await vi.waitFor(() => {
      expect(mockManager.displayConfirmation).toHaveBeenCalledTimes(1);
    });

    const confirmCallback = mockManager.displayConfirmation.mock.calls[0][1];
    confirmCallback(true);

    await vi.waitFor(() => {
      expect(mockManager.displaySuccessMessage).toHaveBeenCalled();
    });

    const postCalls = mockExecuteApi.mock.calls.filter((c) => c[2] === "POST");
    expect(postCalls.length).toBe(1);
    expect(JSON.parse(postCalls[0][4])).toEqual([101]);
  });

  it("leaves the app usable for a second sync after a cancel", async () => {
    const mockExecuteApi = createApiMock();
    const mockManager = createMockSpiraAppManager({ executeApi: mockExecuteApi });

    const handler = await loadSyncHandler(mockManager);

    handler();
    await vi.waitFor(() => {
      expect(mockManager.displayConfirmation).toHaveBeenCalledTimes(1);
    });
    // Cancel the first dialog.
    mockManager.displayConfirmation.mock.calls[0][1](false);
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Second run must reach a dialog again, not be blocked as "in progress".
    handler();
    await vi.waitFor(() => {
      expect(mockManager.displayConfirmation).toHaveBeenCalledTimes(2);
    });
    expect(mockManager.displayWarningMessage).not.toHaveBeenCalledWith(
      expect.stringContaining("Operation already in progress")
    );
  });
});

describe("Sync POST failure: displays the correct error and recovers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  /**
   * Covers TC:2671 (Sync - Mapping POST failure shows error).
   *
   * Automated in place of the manual test: forcing the server POST to fail
   * from the Spira UI requires either revoking permissions mid-session or
   * blocking the request in DevTools, which is brittle to reproduce by hand.
   * Here we make the mapping POST invoke its failure callback and assert the
   * exact error message, no success message, and that the app recovers so a
   * subsequent sync can run.
   */
  it("shows the mapping-failure error, no success, and stays usable after a failed POST", async () => {
    const release = { ReleaseId: 10, Name: "Sprint 1", ReleaseStatusId: 1 };
    const testCases = [{ TestCaseId: 101 }];

    // All GETs succeed; the POST fails via its failure callback.
    const mockExecuteApi = vi.fn((name, version, method, url, body, success, failure) => {
      if (method === "GET" && url.match(/\/releases\/\d+$/)) {
        success(release);
      } else if (method === "GET" && url.includes("/test-sets/") && url.includes("/test-cases")) {
        success(testCases);
      } else if (method === "GET" && url.match(/\/test-cases\/\d+$/)) {
        success({ TestCaseId: parseInt(url.match(/\/test-cases\/(\d+)$/)[1]) });
      } else if (method === "GET" && url.includes("/releases/") && url.includes("/test-cases")) {
        success([]);
      } else if (method === "POST") {
        failure("Server error"); // simulate the mapping POST failing
      }
    });

    const mockManager = createMockSpiraAppManager({ executeApi: mockExecuteApi });

    const handler = await loadSyncHandler(mockManager);
    handler();

    await vi.waitFor(() => {
      expect(mockManager.displayConfirmation).toHaveBeenCalledTimes(1);
    });

    // Confirm the dialog -> triggers the (failing) POST.
    mockManager.displayConfirmation.mock.calls[0][1](true);

    await vi.waitFor(() => {
      expect(mockManager.displayErrorMessage).toHaveBeenCalledWith(
        "Test Set Release Mapper: Could not create release mappings. Check you have permission to modify releases and test cases in this product"
      );
    });

    // No success message should be shown on failure.
    expect(mockManager.displaySuccessMessage).not.toHaveBeenCalled();

    // The app must recover: a second sync reaches the dialog again rather than
    // being blocked with "Operation already in progress".
    handler();
    await vi.waitFor(() => {
      expect(mockManager.displayConfirmation).toHaveBeenCalledTimes(2);
    });
    expect(mockManager.displayWarningMessage).not.toHaveBeenCalledWith(
      expect.stringContaining("Operation already in progress")
    );
  });
});
