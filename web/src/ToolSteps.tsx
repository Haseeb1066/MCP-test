import { useMemo, useState } from "react";

export interface ToolStep {
  tool: string;
  arguments: Record<string, unknown>;
  resultPreview: string;
  durationMs: number;
  isError?: boolean;
}

export interface TurnTiming {
  totalMs: number;
  openAiMs: number;
  toolsMs: number;
  setupMs: number;
  slowest?: { tool: string; durationMs: number };
}

function formatArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return "{}";
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    "list-datasources": "List datasources",
    "list-published-datasource-fields": "List fields (Metadata API)",
    "get-datasource-metadata": "Datasource metadata",
    "query-datasource": "Query datasource",
    "list-workbooks": "List workbooks",
    "list-views": "List views",
    "get-workbook": "Get workbook",
    "get-view-data": "Get view data",
    "search-content": "Search content",
  };
  return labels[name] ?? name;
}

type SortMode = "order" | "duration";

export function ToolSteps({ steps, timing }: { steps: ToolStep[]; timing?: TurnTiming }) {
  const [open, setOpen] = useState(true);
  const [sortBy, setSortBy] = useState<SortMode>("duration");

  const maxToolMs = useMemo(
    () => Math.max(1, ...steps.map((s) => s.durationMs)),
    [steps]
  );

  const slowestMs = timing?.slowest?.durationMs ?? maxToolMs;

  const displaySteps = useMemo(() => {
    const indexed = steps.map((s, i) => ({ ...s, originalIndex: i }));
    if (sortBy === "duration") {
      return [...indexed].sort((a, b) => b.durationMs - a.durationMs);
    }
    return indexed;
  }, [steps, sortBy]);

  if (!steps.length) return null;

  return (
    <div className="tool-steps">
      <button
        type="button"
        className="tool-steps-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="tool-steps-chevron">{open ? "▼" : "▶"}</span>
        Timing · {steps.length} tool{steps.length === 1 ? "" : "s"}
        {timing ? ` · ${formatMs(timing.totalMs)} total` : ""}
      </button>

      {timing && (
        <div className="tool-timing-summary" role="region" aria-label="Request timing breakdown">
          <div className="tool-timing-row">
            <span className="tool-timing-label">Total</span>
            <span className="tool-timing-value">{formatMs(timing.totalMs)}</span>
          </div>
          <div className="tool-timing-row">
            <span className="tool-timing-label">Tableau tools</span>
            <span className="tool-timing-value">{formatMs(timing.toolsMs)}</span>
            <span className="tool-timing-pct">
              {timing.totalMs > 0 ? `${Math.round((timing.toolsMs / timing.totalMs) * 100)}%` : ""}
            </span>
          </div>
          <div className="tool-timing-row">
            <span className="tool-timing-label">OpenAI</span>
            <span className="tool-timing-value">{formatMs(timing.openAiMs)}</span>
            <span className="tool-timing-pct">
              {timing.totalMs > 0 ? `${Math.round((timing.openAiMs / timing.totalMs) * 100)}%` : ""}
            </span>
          </div>
          {timing.setupMs > 0 && (
            <div className="tool-timing-row">
              <span className="tool-timing-label">MCP setup</span>
              <span className="tool-timing-value">{formatMs(timing.setupMs)}</span>
            </div>
          )}
          {timing.slowest && (
            <div className="tool-timing-slowest">
              Slowest: <strong>{toolLabel(timing.slowest.tool)}</strong> ({formatMs(timing.slowest.durationMs)})
            </div>
          )}
        </div>
      )}

      {open && (
        <>
          <div className="tool-steps-toolbar">
            <span className="tool-steps-toolbar-label">Sort</span>
            <button
              type="button"
              className={`tool-sort-btn${sortBy === "duration" ? " active" : ""}`}
              onClick={() => setSortBy("duration")}
            >
              Slowest first
            </button>
            <button
              type="button"
              className={`tool-sort-btn${sortBy === "order" ? " active" : ""}`}
              onClick={() => setSortBy("order")}
            >
              Call order
            </button>
          </div>
          <ol className="tool-steps-list">
            {displaySteps.map((s) => {
              const isSlowest = s.durationMs >= slowestMs && steps.length > 0;
              const isSlow = s.durationMs >= 5000;
              return (
                <li
                  key={`${s.tool}-${s.originalIndex}`}
                  className={`tool-step${s.isError ? " tool-step-error" : ""}${isSlowest ? " tool-step-slowest" : ""}${isSlow && !isSlowest ? " tool-step-slow" : ""}`}
                >
                  <div className="tool-step-head">
                    <span className="tool-step-num">
                      {sortBy === "order" ? s.originalIndex + 1 : "·"}
                    </span>
                    <span className="tool-step-name">{toolLabel(s.tool)}</span>
                    <code className="tool-step-id">{s.tool}</code>
                    <span className="tool-step-ms">{formatMs(s.durationMs)}</span>
                    {isSlowest && <span className="tool-step-badge">slowest</span>}
                  </div>
                  <div
                    className="tool-step-bar"
                    role="presentation"
                    style={{ width: `${Math.round((s.durationMs / maxToolMs) * 100)}%` }}
                  />
                  <details className="tool-step-details">
                    <summary>Arguments &amp; response</summary>
                    <div className="tool-step-section">
                      <div className="tool-step-label">Arguments</div>
                      <pre>{formatArgs(s.arguments)}</pre>
                    </div>
                    <div className="tool-step-section">
                      <div className="tool-step-label">Response</div>
                      <pre>{s.resultPreview}</pre>
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
