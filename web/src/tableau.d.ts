/** Minimal Tableau Extensions API types used by this app. */
interface TableauDashboard {
  readonly name: string;
  readonly workbook: { readonly name: string };
  readonly worksheets: ReadonlyArray<{ readonly name: string }>;
}

interface TableauSettings {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  initializeAsync(): Promise<void>;
  saveAsync(): Promise<void>;
}

interface TableauExtensionsApi {
  initializeAsync(): Promise<void>;
  readonly dashboardContent: {
    readonly dashboard: TableauDashboard;
  };
  readonly settings: TableauSettings;
}

interface TableauGlobal {
  readonly extensions: TableauExtensionsApi;
}

interface Window {
  tableau?: TableauGlobal;
}
