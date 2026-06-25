import { apiUrl } from "./config";
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
};

const WORKBOOK_STORAGE_KEY = "tableau-selected-workbook-id";

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

function storedWorkbookId(): string | null {
  try {
    return sanitizeParam(localStorage.getItem(WORKBOOK_STORAGE_KEY));
  } catch {
    return null;
  }
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
    const hint = data.detail ?? `Could not resolve workbook on the server.`;
    throw new Error(hint);
  }
  return data.workbook;
}

/**
 * Initialize Tableau Extensions API and resolve the current workbook to MCP workbookId (LUID).
 * For local testing without Tableau:
 *   ?extension=1&workbookId=ed6bafd2-...   (same id as dropdown selection)
 *   ?extension=1&workbookName=Sales%20(Sales)
 *   ?extension=1&contentUrl=Sales
 *   ?extension=1   (uses last workbook picked in the dropdown, from localStorage)
 */
export async function loadExtensionContext(): Promise<ExtensionContext> {
  const test = testParamsFromQuery();

  if (window.tableau?.extensions) {
    await window.tableau.extensions.initializeAsync();
    const dashboard = window.tableau.extensions.dashboardContent.dashboard;
    const workbookName = dashboard.workbook.name;
    const workbook = await resolveWorkbook({ name: workbookName });
    return {
      workbook,
      dashboardName: dashboard.name,
      worksheetNames: dashboard.worksheets.map((w) => w.name),
    };
  }

  if (test.workbookId) {
    const workbook = await resolveWorkbook({ workbookId: test.workbookId });
    return { workbook, dashboardName: "Test dashboard", worksheetNames: [] };
  }

  if (test.contentUrl) {
    const workbook = await resolveWorkbook({ contentUrl: test.contentUrl });
    return { workbook, dashboardName: "Test dashboard", worksheetNames: [] };
  }

  if (test.workbookName) {
    const workbook = await resolveWorkbook({
      name: test.workbookName,
      projectName: test.projectName ?? undefined,
    });
    return { workbook, dashboardName: "Test dashboard", worksheetNames: [] };
  }

  const savedId = storedWorkbookId();
  if (savedId) {
    const workbook = await resolveWorkbook({ workbookId: savedId });
    return { workbook, dashboardName: "Test dashboard", worksheetNames: [] };
  }

  throw new Error(
    "Tableau Extensions API not available. Pick a workbook in the dropdown first, then open ?extension=1, or add workbookId= / contentUrl= / workbookName=Sales%20(Sales)."
  );
}
