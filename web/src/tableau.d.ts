/** Minimal Tableau Extensions API types used by this app. */
interface TableauDashboard {
  readonly name: string;
  readonly workbook: { readonly name: string };
  readonly worksheets: ReadonlyArray<{ readonly name: string }>;
}

interface TableauExtensionsApi {
  initializeAsync(): Promise<void>;
  readonly dashboardContent: {
    readonly dashboard: TableauDashboard;
  };
}

interface TableauGlobal {
  readonly extensions: TableauExtensionsApi;
}

interface Window {
  tableau?: TableauGlobal;
}
