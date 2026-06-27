import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { APP_BUILD_ID, debugLog } from "./debugLog";
import { isTableauHost } from "./config";
import "./index.css";

// #region agent log
debugLog("main.tsx:boot", "App bundle loaded", {
  href: typeof window !== "undefined" ? window.location.href : "",
  inIframe: typeof window !== "undefined" ? window.self !== window.top : false,
  hasTableau: typeof window !== "undefined" ? Boolean(window.tableau?.extensions) : false,
  isTableauHost: typeof window !== "undefined" ? isTableauHost() : false,
  scriptSrc: typeof document !== "undefined" ? document.querySelector("script[type=module]")?.getAttribute("src") : null,
}, "A");
// #endregion

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
