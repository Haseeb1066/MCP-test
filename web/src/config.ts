/** API origin for fetch calls. Empty string = same origin (production or Vite /api proxy). */
export function apiBase(): string {
  const raw = import.meta.env.VITE_API_BASE;
  if (typeof raw === "string" && raw.trim()) {
    return raw.replace(/\/$/, "");
  }
  return "";
}

export function apiUrl(path: string): string {
  const base = apiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

/** True when loaded as a Tableau dashboard extension (or ?extension=1 for local testing). */
export function isExtensionContext(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("extension") === "1") return true;
  return Boolean(window.tableau?.extensions);
}
