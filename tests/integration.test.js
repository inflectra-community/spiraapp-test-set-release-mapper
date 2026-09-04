import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration tests for the Test Set Release Mapper full workflow.
 *
 * Since testSetList.js is an IIFE that self-executes on load and relies on
 * globals (spiraAppManager, APP_GUID), we:
 * 1. Set up global mocks before loading the module
 * 2. Use vi.stubGlobal() for spiraAppManager and APP_GUID
 * 3. Load testSetList.js dynamically per test group using vi.resetModules()
 * 4. Capture the registered click handler to invoke directly
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 2.1, 2.4, 2.5, 2.7, 3.1, 3.4, 4.1, 4.3
 */

function createMockSpiraAppManager(overrides = {}) {
  return {
    projectId: 83,
    canViewArtifactType: vi.fn().mockReturnValue(true),
    canModifyArtifactType: vi.fn().mockReturnValue(true),
    registerEvent_menuEntryClick: vi.fn(),
    getGridSelectedItems: vi.fn().mockReturnValue([]),
    createComboDialog: vi.fn(),
    executeApi: vi.fn(),
    displayErrorMessage: vi.fn(),
    displayWarningMessage: vi.fn(),
    displaySuccessMessage: vi.fn(),
    ...overrides,
  };
}

async function loadModuleAndGetHandler(mockManager) {
  vi.stubGlobal("spiraAppManager", mockManager);
  vi.stubGlobal("APP_GUID", "test-guid-12345");

  await import("../testSetList.js?" + Date.now() + Math.random());

  // The IIFE registers the handler immediately on load
  expect(mockManager.registerEvent_menuEntryClick).toHaveBeenCalled();
  const handler =
    mockManager.registerEvent_menuEntryClick.mock.calls[0][2];
  return handler;
}

describe("Integration: Page initialization and handler registration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  /**
   * Validates: Requirements 5.2
   * The IIFE registers registerEvent_menuEntryClick with APP_GUID,
   * "mapToRelease", and a function reference.
   */
  it("registers menu click handler with correct arguments on load", async () => {
    const mockManager = createMockSpiraAppManager();
    vi.stubGlobal("spiraAppManager", mockManager);
    vi.stubGlobal("APP_GUID", "test-guid-12345");

    await import("../testSetList.js?" + Date.now() + Math.random());

    expect(mockManager.registerEvent_menuEntryClick).toHaveBeenCalledWith(
      "test-guid-12345",
      "mapToRelease",
      expect.any(Function)
    );
  });
});

describe("Integration: Selection validation gates the workflow", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  /**
   * Validates: Requirements 5.1, 5.3
   * When no test set is selected, the handler shows an error and
   * does not proceed to API calls.
   */
  it("displays error when no test set is selected", async () => {
    const mockManager = createMockSpiraAppManager({
      getGridSelectedItems: vi.fn().mockReturnValue([]),
    });

    const handler = await loadModuleAndGetHandler(mockManager);
    handler();

    expect(mockManager.displayErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("Please select a test set")
    );
    expect(mockManager.executeApi).not.toHaveBeenCalled();
  });

  /**
   * Validates: Requirements 5.1, 5.2
   * When a single test set is selected, the workflow proceeds past
   * validation to release retrieval.
   */
  it("proceeds past validation when a single test set is selected", async () => {
    const mockManager = createMockSpiraAppManager({
      getGridSelectedItems: vi.fn().mockReturnValue([42]),
      executeApi: vi.fn(),
    });

    const handler = await loadModuleAndGetHandler(mockManager);
    handler();

    // Validation passed, so it should call executeApi to get releases
    expect(mockManager.executeApi).toHaveBeenCalled();
  });
});

describe("Integration: End-to-end workflow with mocked API responses", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  /**
   * Validates: Requirements 2.1, 2.4, 3.1, 4.1
   * Full happy path: select test set -> get releases -> pick release ->
   * get test cases -> get existing mappings -> POST mapping -> success.
   */
  it("completes full mapping workflow and displays success message", async () => {
    const releases = [
      { ReleaseId: 10, Name: "Sprint 2", ReleaseStatusId: 1 },
      { ReleaseId: 20, Name: "Sprint 1", ReleaseStatusId: 2 },
      { ReleaseId: 30, Name: "Archived", ReleaseStatusId: 3 },
    ];

    const testCases = [
      { TestCaseId: 101 },
      { TestCaseId: 102 },
      { TestCaseId: 103 },
    ];

    // Track executeApi calls to respond with appropriate data
    const mockExecuteApi = vi.fn((name, version, method, url, body, success, failure) => {
      if (method === "GET" && url.includes("/releases") && !url.includes("/test-cases") && !url.includes("/releases/")) {
        // GET all releases for the project
        success(releases);
      } else if (method === "GET" && url.includes("/test-sets/") && url.includes("/test-cases")) {
        // GET test cases in the test set
        success(testCases);
      } else if (method === "GET" && url.match(/\/test-cases\/\d+$/)) {
        // GET individual test case (cross-product filtering) - all succeed (local)
        success({ TestCaseId: parseInt(url.match(/\/test-cases\/(\d+)$/)[1]) });
      } else if (method === "GET" && url.includes("/releases/") && url.includes("/test-cases")) {
        // GET existing release/test case mappings
        success([]);
      } else if (method === "POST") {
        // POST: create mappings
        success({});
      }
    });

    const mockManager = createMockSpiraAppManager({
      getGridSelectedItems: vi.fn().mockReturnValue([42]),
      executeApi: mockExecuteApi,
      createComboDialog: vi.fn(),
    });

    const handler = await loadModuleAndGetHandler(mockManager);
    handler();

    // Wait for the async releases GET to resolve
    await vi.waitFor(() => {
      expect(mockManager.createComboDialog).toHaveBeenCalled();
    });

    // Verify dialog was created with sorted active releases (Sprint 1 before Sprint 2)
    const dialogArgs = mockManager.createComboDialog.mock.calls[0];
    expect(dialogArgs[3]).toEqual(["Sprint 1", "Sprint 2"]);

    // Simulate user selecting "Sprint 1" from the dropdown
    const dialogCallback = dialogArgs[4];
    dialogCallback("Sprint 1");

    // Wait for the async test case retrieval and mapping to complete
    await vi.waitFor(() => {
      expect(mockManager.displaySuccessMessage).toHaveBeenCalledWith(
        expect.stringContaining("3")
      );
    });

    // Verify the POST was made with the test case IDs
    const postCall = mockExecuteApi.mock.calls.find(
      (call) => call[2] === "POST"
    );
    expect(postCall).toBeDefined();
    expect(JSON.parse(postCall[4])).toEqual([101, 102, 103]);
  });
});

describe("Integration: API failure callbacks display correct messages", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  /**
   * Validates: Requirement 2.7
   * When the releases GET fails, an error message is displayed.
   */
  it("displays error when releases API call fails", async () => {
    const mockExecuteApi = vi.fn((name, version, method, url, body, success, failure) => {
      if (method === "GET" && url.includes("/releases")) {
        failure("Network error");
      }
    });

    const mockManager = createMockSpiraAppManager({
      getGridSelectedItems: vi.fn().mockReturnValue([42]),
      executeApi: mockExecuteApi,
    });

    const handler = await loadModuleAndGetHandler(mockManager);
    handler();

    await vi.waitFor(() => {
      expect(mockManager.displayErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Could not retrieve releases")
      );
    });
  });

  /**
   * Validates: Requirement 3.4
   * When the test cases GET fails, an error message is displayed.
   */
  it("displays error when test cases API call fails", async () => {
    const releases = [
      { ReleaseId: 10, Name: "Sprint 1", ReleaseStatusId: 1 },
    ];

    const mockExecuteApi = vi.fn((name, version, method, url, body, success, failure) => {
      if (method === "GET" && url.includes("/releases") && !url.includes("/test-cases")) {
        success(releases);
      } else if (method === "GET" && url.includes("/test-sets/") && url.includes("/test-cases")) {
        failure("Network error");
      }
    });

    const mockManager = createMockSpiraAppManager({
      getGridSelectedItems: vi.fn().mockReturnValue([42]),
      executeApi: mockExecuteApi,
      createComboDialog: vi.fn(),
    });

    const handler = await loadModuleAndGetHandler(mockManager);
    handler();

    // Wait for releases to load and dialog to appear
    await vi.waitFor(() => {
      expect(mockManager.createComboDialog).toHaveBeenCalled();
    });

    // Simulate user selecting a release
    const dialogCallback = mockManager.createComboDialog.mock.calls[0][4];
    dialogCallback("Sprint 1");

    await vi.waitFor(() => {
      expect(mockManager.displayErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Could not retrieve test cases")
      );
    });
  });

  /**
   * Validates: Requirement 4.3
   * When the mapping POST fails, an error message is displayed.
   */
  it("displays error when mapping POST API call fails", async () => {
    const releases = [
      { ReleaseId: 10, Name: "Sprint 1", ReleaseStatusId: 1 },
    ];
    const testCases = [{ TestCaseId: 101 }];

    const mockExecuteApi = vi.fn((name, version, method, url, body, success, failure) => {
      if (method === "GET" && url.includes("/releases") && !url.includes("/test-cases") && !url.includes("/releases/")) {
        success(releases);
      } else if (method === "GET" && url.includes("/test-sets/") && url.includes("/test-cases")) {
        success(testCases);
      } else if (method === "GET" && url.match(/\/test-cases\/\d+$/)) {
        // Cross-product filtering - test case is local
        success({ TestCaseId: parseInt(url.match(/\/test-cases\/(\d+)$/)[1]) });
      } else if (method === "GET" && url.includes("/releases/") && url.includes("/test-cases")) {
        // Existing mappings: empty
        success([]);
      } else if (method === "POST") {
        failure("Server error");
      }
    });

    const mockManager = createMockSpiraAppManager({
      getGridSelectedItems: vi.fn().mockReturnValue([42]),
      executeApi: mockExecuteApi,
      createComboDialog: vi.fn(),
    });

    const handler = await loadModuleAndGetHandler(mockManager);
    handler();

    await vi.waitFor(() => {
      expect(mockManager.createComboDialog).toHaveBeenCalled();
    });

    const dialogCallback = mockManager.createComboDialog.mock.calls[0][4];
    dialogCallback("Sprint 1");

    await vi.waitFor(() => {
      expect(mockManager.displayErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Could not create release mappings")
      );
    });
  });
});

describe("Integration: Dialog dismissal cancels the operation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  /**
   * Validates: Requirement 2.5
   * If the user dismisses the dropdown dialog, no further API calls
   * are made beyond the initial releases GET.
   */
  it("does not trigger further operations when dialog is dismissed", async () => {
    const releases = [
      { ReleaseId: 10, Name: "Sprint 1", ReleaseStatusId: 1 },
    ];

    const mockExecuteApi = vi.fn((name, version, method, url, body, success, failure) => {
      if (method === "GET" && url.includes("/releases")) {
        success(releases);
      }
    });

    const mockManager = createMockSpiraAppManager({
      getGridSelectedItems: vi.fn().mockReturnValue([42]),
      executeApi: mockExecuteApi,
      createComboDialog: vi.fn(),
    });

    const handler = await loadModuleAndGetHandler(mockManager);
    handler();

    await vi.waitFor(() => {
      expect(mockManager.createComboDialog).toHaveBeenCalled();
    });

    // User dismisses dialog by passing null
    const dialogCallback = mockManager.createComboDialog.mock.calls[0][4];
    dialogCallback(null);

    // Give a tick for any async operations to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The only executeApi call should be the releases GET - no further calls
    expect(mockExecuteApi).toHaveBeenCalledTimes(1);
    expect(mockExecuteApi.mock.calls[0][2]).toBe("GET");
  });
});
