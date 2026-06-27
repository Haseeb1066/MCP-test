import { apiUrl, isTableauHost } from "./config";
import { readJson } from "./api";

export type WorkbookSummary = {
  id: string;
  name: string;
  contentUrl?: string;
  projectName?: string;
  defaultViewId?: string;
};

export type ExtensionContext = {
  workbook: WorkbookSummary;
  dashboardName: string;
  worksheetNames: string[];
  source: "settings" | "query" | "tableau-name";
};

const SETTINGS_WORKBOOK_ID = "workbookId";

function sanitizeParam(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/\\+$/g, "").trim();
  return cleaned || null;
}

function testParamsFromQuery(): {
  workbookId: string | null;
  workbookName: string | null;
  projectName: string | null;
  contentUrl: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  return {
    workbookId: sanitizeParam(params.get("workbookId")),
    workbookName: sanitizeParam(params.get("workbookName")),
    projectName: sanitizeParam(params.get("projectName")),
    contentUrl: sanitizeParam(params.get("contentUrl")),
  };
}

async function resolveWorkbook(options: {
  workbookId?: string;
  name?: string;
  projectName?: string;
  contentUrl?: string;
}): Promise<WorkbookSummary> {
  const qs = new URLSearchParams();
  if (options.workbookId) qs.set("workbookId", options.workbookId);
  if (options.name) qs.set("name", options.name);
  if (options.projectName) qs.set("projectName", options.projectName);
  if (options.contentUrl) qs.set("contentUrl", options.contentUrl);
  const res = await fetch(apiUrl(`/api/workbooks/resolve?${qs}`));
  const data = await readJson<{ workbook: WorkbookSummary; detail?: string }>(res);
  if (!data.workbook?.id) {
    throw new Error(data.detail ?? "Could not resolve workbook on the server.");
  }
  return data.workbook;
}

async function waitForTableauApi(timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.tableau?.extensions) return window.tableau.extensions;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

async function persistWorkbookId(settings: TableauSettings, workbookId: string): Promise<void> {
  const current = settings.get(SETTINGS_WORKBOOK_ID);
  if (current === workbookId) return;
  settings.set(SETTINGS_WORKBOOK_ID, workbookId);
  await settings.saveAsync();
}

async function loadFromTableauHost(test: ReturnType<typeof testParamsFromQuery>): Promise<ExtensionContext> {
  const api = await waitForTableauApi();
  if (!api) {
    if (test.workbookId) {
      const workbook = await resolveWorkbook({ workbookId: test.workbookId });
      return { workbook, dashboardName: "Dashboard", worksheetNames: [], source: "query" };
    }
    throw new Error(
      "Tableau Extensions API did not load. Reload the dashboard or check the extension URL is allowlisted."
    );
  }

  await api.initializeAsync();
  await api.settings.initializeAsync();
  const dashboard = api.dashboardContent.dashboard;
  const settings = api.settings;

  const storedId = sanitizeParam(settings.get(SETTINGS_WORKBOOK_ID) ?? null);
  if (storedId) {
    try {
      const workbook = await resolveWorkbook({ workbookId: storedId });
      return {
        workbook,
        dashboardName: dashboard.name,
        worksheetNames: dashboard.worksheets.map((w) => w.name),
        source: "settings",
      };
    } catch {
      /* stored id stale — resolve again from Tableau context */
    }
  }

  if (test.workbookId) {
    const workbook = await resolveWorkbook({ workbookId: test.workbookId });
    await persistWorkbookId(settings, workbook.id);
    return {
      workbook,
      dashboardName: dashboard.name,
      worksheetNames: dashboard.worksheets.map((w) => w.name),
      source: "query",
    };
  }

  if (test.contentUrl) {
    const workbook = await resolveWorkbook({ contentUrl: test.contentUrl });
    await persistWorkbookId(settings, workbook.id);
    return {
      workbook,
      dashboardName: dashboard.name,
      worksheetNames: dashboard.worksheets.map((w) => w.name),
      source: "query",
    };
  }

  const workbookName = dashboard.workbook.name;
  const workbook = await resolveWorkbook({
    name: workbookName,
    projectName: test.projectName ?? undefined,
  });
  await persistWorkbookId(settings, workbook.id);

  return {
    workbook,
    dashboardName: dashboard.name,
    worksheetNames: dashboard.worksheets.map((w) => w.name),
    source: "tableau-name",
  };
}

async function loadFromLocalTest(test: ReturnType<typeof testParamsFromQuery>): Promise<ExtensionContext> {
  if (test.workbookId) {
    const workbook = await resolveWorkbook({ workbookId: test.workbookId });
    return { workbook, dashboardName: "Test dashboard", worksheetNames: [], source: "query" };
  }
  if (test.contentUrl) {
    const workbook = await resolveWorkbook({ contentUrl: test.contentUrl });
    return { workbook, dashboardName: "Test dashboard", worksheetNames: [], source: "query" };
  }
  if (test.workbookName) {
    const workbook = await resolveWorkbook({
      name: test.workbookName,
      projectName: test.projectName ?? undefined,
    });
    return { workbook, dashboardName: "Test dashboard", worksheetNames: [], source: "tableau-name" };
  }
  throw new Error(
    "Open this app from a Tableau dashboard extension, or add ?workbookId=YOUR-LUID for local testing."
  );
}

/**
 * Resolve the current dashboard workbook to MCP workbookId (LUID).
 * In Tableau: uses saved extension settings first, then auto-resolves and stores the id.
 */
export async function loadExtensionContext(): Promise<ExtensionContext> {
  const test = testParamsFromQuery();
  if (isTableauHost()) {
    return loadFromTableauHost(test);
  }
  return loadFromLocalTest(test);
}
