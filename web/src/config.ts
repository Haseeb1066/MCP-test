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

function isInIframe(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** True when running inside Tableau (iframe or Extensions API). */
export function isTableauHost(): boolean {
  if (typeof window === "undefined") return false;
  if (window.tableau?.extensions) return true;
  return isInIframe();
}
