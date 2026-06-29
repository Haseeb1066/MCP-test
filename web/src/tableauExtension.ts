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
  source:
    | "settings"
    | "query"
    | "tableau-name"
    | "tableau-contentUrl"
    | "referrer-contentUrl";
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

/** Extract workbook contentUrl from Tableau dashboard URLs (e.g. .../views/AccountsPayableAI-MCP/ExecutiveSummary). */
export function parseContentUrlFromTableauUrl(url: string): string | null {
  try {
    const decoded = decodeURIComponent(url);
    const viewsMatch = decoded.match(/\/views\/([^/?#:]+)(?:\/|[?#:]|$)/i);
    if (viewsMatch?.[1]) return viewsMatch[1];
  } catch {
    /* ignore malformed URLs */
  }
  return null;
}

function getDashboardUrlHints(): string[] {
  const hints: string[] = [];
  if (document.referrer) hints.push(document.referrer);
  hints.push(window.location.href);

  const ancestorOrigins = (
    document.location as Location & { ancestorOrigins?: DOMStringList }
  ).ancestorOrigins;
  if (ancestorOrigins) {
    for (let i = 0; i < ancestorOrigins.length; i++) {
      hints.push(ancestorOrigins[i]);
    }
  }

  return hints;
}

function parseContentUrlFromDashboardHints(): string | null {
  for (const hint of getDashboardUrlHints()) {
    const contentUrl = parseContentUrlFromTableauUrl(hint);
    if (contentUrl) return contentUrl;
  }
  return null;
}

/** Poll briefly — referrer can appear slightly after iframe load on some Tableau hosts. */
async function waitForContentUrlHint(timeoutMs = 2_500): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const contentUrl = parseContentUrlFromDashboardHints();
    if (contentUrl) return contentUrl;
    await new Promise((r) => setTimeout(r, 80));
  }
  return null;
}

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

async function resolveFromReferrerHint(): Promise<ExtensionContext> {
  const contentUrl = await waitForContentUrlHint();
  if (!contentUrl) {
    throw new Error("No workbook slug in dashboard URL");
  }
  const workbook = await resolveWorkbook({ contentUrl });
  return extensionContextWithoutApi(workbook, contentUrl, "referrer-contentUrl");
}

async function waitForTableauApi(timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.tableau?.extensions) return window.tableau.extensions;
    await new Promise((r) => setTimeout(r, 80));
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

function extensionContextWithoutApi(
  workbook: WorkbookSummary,
  dashboardName: string,
  source: ExtensionContext["source"]
): ExtensionContext {
  return {
    workbook,
    dashboardName,
    worksheetNames: [],
    source,
  };
}

async function loadFromTableauApi(
  test: ReturnType<typeof testParamsFromQuery>
): Promise<ExtensionContext> {
  const api = await waitForTableauApi();
  if (!api) {
    throw new Error("Tableau Extensions API not available");
  }

  await api.initializeAsync();
  await api.settings.initializeAsync();
  const dashboard = api.dashboardContent.dashboard;
  const settings = api.settings;
  const tableauWorkbookName = dashboard.workbook.name;

  const storedId = sanitizeParam(settings.get(SETTINGS_WORKBOOK_ID) ?? null);
  const storedName = sanitizeParam(settings.get(SETTINGS_WORKBOOK_NAME) ?? null);

  if (storedId && storedName && storedName === tableauWorkbookName) {
    try {
      const workbook = await resolveWorkbook({ workbookId: storedId });
      return extensionContextFromDashboard(dashboard, workbook, "settings");
    } catch {
      /* stale cache */
    }
  }

  try {
    const { workbook, source } = await resolveFromTableauWorkbook(
      tableauWorkbookName,
      test.projectName ?? undefined
    );
    await persistWorkbookContext(settings, workbook, tableauWorkbookName);
    return extensionContextFromDashboard(dashboard, workbook, source);
  } catch {
    const contentUrl = parseContentUrlFromDashboardHints();
    if (contentUrl) {
      const workbook = await resolveWorkbook({ contentUrl });
      await persistWorkbookContext(settings, workbook, tableauWorkbookName || contentUrl);
      return extensionContextFromDashboard(dashboard, workbook, "referrer-contentUrl");
    }
    throw new Error(`Could not resolve workbook "${tableauWorkbookName}"`);
  }
}

async function loadFromTableauHost(test: ReturnType<typeof testParamsFromQuery>): Promise<ExtensionContext> {
  if (test.workbookId) {
    const workbook = await resolveWorkbook({ workbookId: test.workbookId });
    return extensionContextWithoutApi(workbook, "Dashboard", "query");
  }

  if (test.contentUrl) {
    const workbook = await resolveWorkbook({ contentUrl: test.contentUrl });
    return extensionContextWithoutApi(workbook, test.contentUrl, "query");
  }

  // Resolve immediately: dashboard URL (fast) and Tableau API (rich) run in parallel.
  const strategies: Promise<ExtensionContext>[] = [loadFromTableauApi(test)];

  if (parseContentUrlFromDashboardHints() || document.referrer || isTableauHost()) {
    strategies.push(resolveFromReferrerHint());
  }

  try {
    return await Promise.any(strategies);
  } catch {
    throw new Error(
      "Could not detect workbook for this dashboard. Allowlist https://mcp-test-ldxl.onrender.com on Tableau Server, then reload."
    );
  }
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

  const contentUrl = parseContentUrlFromDashboardHints();
  if (contentUrl) {
    const workbook = await resolveWorkbook({ contentUrl });
    return {
      workbook,
      dashboardName: contentUrl,
      worksheetNames: [],
      source: "referrer-contentUrl",
    };
  }

  throw new Error(
    "Open this app from a Tableau dashboard extension, or add ?workbookId= or ?contentUrl= for local testing."
  );
}

/**
 * Resolve the current dashboard workbook to MCP workbookId (LUID) as soon as the extension loads.
 */
export async function loadExtensionContext(): Promise<ExtensionContext> {
  const test = testParamsFromQuery();
  if (isTableauHost()) {
    return loadFromTableauHost(test);
  }
  return loadFromLocalTest(test);
}
