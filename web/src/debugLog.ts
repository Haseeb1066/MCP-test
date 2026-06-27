/** Bump when verifying deploy/cache issues. Shown in UI + debug logs. */
declare const __APP_BUILD_ID__: string;
export const APP_BUILD_ID =
  typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "ext-only-v3";

const INGEST =
  "http://127.0.0.1:7903/ingest/65f9275e-ed56-4523-ad18-1154bc587f20";
const SESSION = "766da3";

export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string
) {
  const payload = {
    sessionId: SESSION,
    runId: "pre-fix",
    hypothesisId,
    location,
    message,
    data: { ...data, buildId: APP_BUILD_ID },
    timestamp: Date.now(),
  };
  // #region agent log
  fetch(INGEST, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": SESSION },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
}
