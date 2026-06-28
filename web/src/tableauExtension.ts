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
  source: "settings" | "query" | "tableau-name" | "tableau-contentUrl";
};

const SETTINGS_WORKBOOK_ID = "workbookId";
const SETTINGS_WORKBOOK_NAME = "workbookName";

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

/** Guess Tableau contentUrl slugs from the display name shown in the dashboard. */
function contentUrlCandidatesFromName(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const candidates = [
    trimmed.replace(/[()]/g, "").replace(/\s+/g, ""),
    trimmed.replace(/\s+/g, ""),
    trimmed.replace(/[^a-zA-Z0-9]/g, ""),
  ];
  return [...new Set(candidates.filter((c) => c.length > 0))];
}

async function resolveFromTableauWorkbook(
  workbookName: string,
  projectName?: string
): Promise<{ workbook: WorkbookSummary; source: "tableau-name" | "tableau-contentUrl" }> {
  try {
    const workbook = await resolveWorkbook({ name: workbookName, projectName });
    return { workbook, source: "tableau-name" };
  } catch (nameErr) {
    for (const contentUrl of contentUrlCandidatesFromName(workbookName)) {
      try {
        const workbook = await resolveWorkbook({ contentUrl });
        return { workbook, source: "tableau-contentUrl" };
      } catch {
        /* try next slug candidate */
      }
    }
    throw nameErr instanceof Error ? nameErr : new Error(String(nameErr));
  }
}

async function waitForTableauApi(timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.tableau?.extensions) return window.tableau.extensions;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

async function persistWorkbookContext(
  settings: TableauSettings,
  workbook: WorkbookSummary,
  tableauWorkbookName: string
): Promise<void> {
  settings.set(SETTINGS_WORKBOOK_ID, workbook.id);
  settings.set(SETTINGS_WORKBOOK_NAME, tableauWorkbookName);
  await settings.saveAsync();
}

function extensionContextFromDashboard(
  dashboard: TableauDashboard,
  workbook: WorkbookSummary,
  source: ExtensionContext["source"]
): ExtensionContext {
  return {
    workbook,
    dashboardName: dashboard.name,
    worksheetNames: dashboard.worksheets.map((w) => w.name),
    source,
  };
}

async function loadFromTableauHost(test: ReturnType<typeof testParamsFromQuery>): Promise<ExtensionContext> {
  const api = await waitForTableauApi();
  if (!api) {
    if (test.workbookId) {
      const workbook = await resolveWorkbook({ workbookId: test.workbookId });
      return { workbook, dashboardName: "Dashboard", worksheetNames: [], source: "query" };
    }
    if (test.contentUrl) {
      const workbook = await resolveWorkbook({ contentUrl: test.contentUrl });
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
  const tableauWorkbookName = dashboard.workbook.name;

  if (test.workbookId) {
    const workbook = await resolveWorkbook({ workbookId: test.workbookId });
    await persistWorkbookContext(settings, workbook, tableauWorkbookName);
    return extensionContextFromDashboard(dashboard, workbook, "query");
  }

  if (test.contentUrl) {
    const workbook = await resolveWorkbook({ contentUrl: test.contentUrl });
    await persistWorkbookContext(settings, workbook, tableauWorkbookName);
    return extensionContextFromDashboard(dashboard, workbook, "query");
  }

  const storedId = sanitizeParam(settings.get(SETTINGS_WORKBOOK_ID) ?? null);
  const storedName = sanitizeParam(settings.get(SETTINGS_WORKBOOK_NAME) ?? null);

  // Re-use cached id only when still on the same workbook (moving extension to another dashboard re-resolves).
  if (storedId && storedName && storedName === tableauWorkbookName) {
    try {
      const workbook = await resolveWorkbook({ workbookId: storedId });
      return extensionContextFromDashboard(dashboard, workbook, "settings");
    } catch {
      /* stored id stale — resolve again from Tableau context */
    }
  }

  const { workbook, source } = await resolveFromTableauWorkbook(
    tableauWorkbookName,
    test.projectName ?? undefined
  );
  await persistWorkbookContext(settings, workbook, tableauWorkbookName);

  return extensionContextFromDashboard(dashboard, workbook, source);
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
    const { workbook, source } = await resolveFromTableauWorkbook(
      test.workbookName,
      test.projectName ?? undefined
    );
    return { workbook, dashboardName: "Test dashboard", worksheetNames: [], source };
  }
  throw new Error(
    "Open this app from a Tableau dashboard extension, or add ?workbookId= or ?contentUrl= for local testing."
  );
}

/**
 * Resolve the current dashboard workbook to MCP workbookId (LUID).
 * In Tableau: reads workbook from the dashboard, resolves via name/contentUrl, caches per workbook.
 */
export async function loadExtensionContext(): Promise<ExtensionContext> {
  const test = testParamsFromQuery();
  if (isTableauHost()) {
    return loadFromTableauHost(test);
  }
  return loadFromLocalTest(test);
}
