import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { readJson } from "./api";
import { apiUrl, isExtensionContext } from "./config";
import {
  loadExtensionContext,
  type ExtensionContext,
  type WorkbookSummary,
} from "./tableauExtension";
import { ToolSteps, type ToolStep, type TurnTiming } from "./ToolSteps";

type Role = "user" | "assistant";

interface ChatMessage {
  role: Role;
  content: string;
  steps?: ToolStep[];
  timing?: TurnTiming;
}

const WORKBOOK_STORAGE_KEY = "tableau-selected-workbook-id";

const DATASOURCE_STARTERS = [
  "What published datasources can I access?",
  "List fields for CustomerChurn, then show churn by month in 2026",
] as const;

const CAPABILITIES = [
  { icon: "📊", label: "Sheet data", desc: "Pull view data via MCP" },
  { icon: "🔍", label: "Explore views", desc: "List sheets & dashboards" },
  { icon: "💬", label: "Natural language", desc: "Ask in plain English" },
  { icon: "⚡", label: "Live tools", desc: "Transparent MCP steps" },
] as const;

function displayName(value: string): string {
  return value.trim() || value;
}

function workbookLabel(w: WorkbookSummary): string {
  const name = displayName(w.name);
  return w.projectName ? `${name} · ${w.projectName}` : name;
}

function workbookStarters(name: string): string[] {
  const n = displayName(name);
  return [
    `List all sheets in ${n}`,
    `Show data from the default or Summary sheet in ${n}`,
    `What views are in ${n}?`,
    `Give me a short overview of ${n}`,
  ];
}

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="url(#brandGrad)" />
      <path d="M8 22V10h3v12H8zm5-8v8h3v-8h-3zm5 4v4h3v-4h-3zm5-6v10h3V12h-3z" fill="white" fillOpacity="0.95" />
      <defs>
        <linearGradient id="brandGrad" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#1976d2" />
          <stop offset="1" stopColor="#0d9488" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function StatusPill({
  health,
  extensionLoading,
  extensionMode,
  selectedWorkbook,
  workbooksCount,
  isWorkbookMode,
}: {
  health: {
    ok: boolean;
    healthError?: string;
    chatMode?: "workbook" | "datasource";
    tableauSignInOk?: boolean;
    tableauHint?: string;
    hasOpenAi?: boolean;
  } | null;
  extensionLoading: boolean;
  extensionMode: boolean;
  selectedWorkbook: WorkbookSummary | null;
  workbooksCount: number;
  isWorkbookMode: boolean;
}) {
  if (health === null) {
    return (
      <div className="status-pill status-pill--loading">
        <span className="status-dot" />
        Checking connection…
      </div>
    );
  }

  if (health.healthError) {
    return (
      <div className="status-pill status-pill--error">
        <span className="status-dot" />
        {health.healthError}
      </div>
    );
  }

  if (extensionLoading) {
    return (
      <div className="status-pill status-pill--loading">
        <span className="status-dot" />
        Connecting to workbook…
      </div>
    );
  }

  if (!health.ok) {
    const msg =
      health.tableauSignInOk === false && health.tableauHint
        ? health.tableauHint
        : !health.hasOpenAi
          ? "Set OPENAI_API_KEY in .env"
          : "Set Tableau PAT in .env and restart";
    return (
      <div className="status-pill status-pill--error">
        <span className="status-dot" />
        {msg}
      </div>
    );
  }

  const mode = health.chatMode === "datasource" ? "Datasource" : "Workbook";
  const extra =
    extensionMode && selectedWorkbook
      ? displayName(selectedWorkbook.name)
      : !extensionMode && isWorkbookMode && workbooksCount
        ? `${workbooksCount} workbooks`
        : null;

  return (
    <div className="status-pill status-pill--ok">
      <span className="status-dot" />
      Connected · {mode} mode{extra ? ` · ${extra}` : ""}
    </div>
  );
}

export function App() {
  const extensionMode = isExtensionContext();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<
    {
      ok: boolean;
      healthError?: string;
      hasOpenAi?: boolean;
      hasTableau?: boolean;
      chatMode?: "workbook" | "datasource";
      tableauSignInOk?: boolean;
      tableauHint?: string;
    } | null
  >(null);
  const [workbooks, setWorkbooks] = useState<WorkbookSummary[]>([]);
  const [workbooksLoading, setWorkbooksLoading] = useState(false);
  const [workbooksError, setWorkbooksError] = useState<string | null>(null);
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string>(() => {
    if (isExtensionContext()) return "";
    try {
      return localStorage.getItem(WORKBOOK_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [extensionContext, setExtensionContext] = useState<ExtensionContext | null>(null);
  const [extensionLoading, setExtensionLoading] = useState(extensionMode);
  const [extensionError, setExtensionError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isWorkbookMode = health?.chatMode !== "datasource";
  const selectedWorkbook = extensionMode
    ? extensionContext?.workbook ?? null
    : workbooks.find((w) => w.id === selectedWorkbookId) ?? null;

  useEffect(() => {
    fetch(apiUrl("/api/health"))
      .then(async (r) => {
        try {
          return await readJson<{
            ok: boolean;
            hasOpenAi?: boolean;
            hasTableau?: boolean;
            chatMode?: "workbook" | "datasource";
            tableauSignInOk?: boolean;
            tableauHint?: string;
          }>(r);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { ok: false as const, healthError: message };
        }
      })
      .then(setHealth);
  }, []);

  useEffect(() => {
    if (!extensionMode || !health?.ok || !isWorkbookMode) {
      if (!extensionMode) setExtensionLoading(false);
      return;
    }

    let cancelled = false;
    setExtensionLoading(true);
    setExtensionError(null);

    loadExtensionContext()
      .then((ctx) => {
        if (!cancelled) {
          setExtensionContext(ctx);
          setExtensionError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setExtensionError(msg);
          setExtensionContext(null);
        }
      })
      .finally(() => {
        if (!cancelled) setExtensionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [extensionMode, health?.ok, isWorkbookMode]);

  const loadWorkbooks = useCallback(async () => {
    setWorkbooksLoading(true);
    setWorkbooksError(null);
    try {
      const res = await fetch(apiUrl("/api/workbooks"));
      const data = await readJson<{ workbooks?: WorkbookSummary[] }>(res);
      const list = data.workbooks ?? [];
      setWorkbooks(list);
      if (selectedWorkbookId && !list.some((w) => w.id === selectedWorkbookId)) {
        setSelectedWorkbookId("");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setWorkbooksError(msg);
      setWorkbooks([]);
    } finally {
      setWorkbooksLoading(false);
    }
  }, [selectedWorkbookId]);

  useEffect(() => {
    if (extensionMode || !health?.ok || !isWorkbookMode) return;
    void loadWorkbooks();
  }, [extensionMode, health?.ok, isWorkbookMode, loadWorkbooks]);

  useEffect(() => {
    if (extensionMode) return;
    try {
      if (selectedWorkbookId) {
        localStorage.setItem(WORKBOOK_STORAGE_KEY, selectedWorkbookId);
      } else {
        localStorage.removeItem(WORKBOOK_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [extensionMode, selectedWorkbookId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      if (isWorkbookMode && !selectedWorkbook) {
        setError(
          extensionMode
            ? "Waiting for workbook context from Tableau…"
            : "Select a workbook from the dropdown first."
        );
        return;
      }

      setError(null);
      setInput("");
      const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
      setMessages(next);
      setLoading(true);

      try {
        const res = await fetch(apiUrl("/api/chat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next.map((m) => ({ role: m.role, content: m.content })),
            ...(selectedWorkbook ? { selectedWorkbook } : {}),
            ...(extensionMode ? { extensionMode: true } : {}),
          }),
        });
        const data = await readJson<{
          reply?: string;
          steps?: ToolStep[];
          timing?: TurnTiming;
          error?: string;
        }>(res);
        if (!res.ok) throw new Error(data.error ?? res.statusText);
        setMessages([
          ...next,
          {
            role: "assistant",
            content: data.reply ?? "",
            steps: data.steps ?? [],
            timing: data.timing,
          },
        ]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setMessages([...next, { role: "assistant", content: msg }]);
      } finally {
        setLoading(false);
        textareaRef.current?.focus();
      }
    },
    [loading, messages, isWorkbookMode, selectedWorkbook, extensionMode]
  );

  const send = useCallback(() => void sendMessage(input), [input, sendMessage]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    textareaRef.current?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const starters =
    isWorkbookMode && selectedWorkbook
      ? workbookStarters(selectedWorkbook.name)
      : isWorkbookMode
        ? []
        : DATASOURCE_STARTERS;

  const workbookReady = !isWorkbookMode || !!selectedWorkbook;
  const canSend = !loading && !!input.trim() && health?.ok && workbookReady && !extensionLoading;

  const modeBadge = extensionMode
    ? "Extension"
    : health?.chatMode === "datasource"
      ? "Datasource"
      : "Workbook";

  return (
    <div className={`app-shell${extensionMode ? " app-shell--extension" : ""}`}>
      <div className={`app${extensionMode ? " app-extension" : ""}`}>
        <header className="app-header">
          <div className="header-top">
            <div className="brand">
              <BrandMark />
              <div className="brand-text">
                <h1>Tableau MCP</h1>
                <p className="brand-tagline">Analytics Assistant</p>
              </div>
            </div>
            <div className="header-actions">
              <span className="mode-badge" title={`${modeBadge} mode`}>
                {modeBadge}
              </span>
              {messages.length > 0 && (
                <button type="button" className="btn-ghost" onClick={clearChat} disabled={loading}>
                  Clear chat
                </button>
              )}
            </div>
          </div>

          <p className="header-subtitle">
            {extensionMode
              ? "Ask questions about this workbook — scoped automatically from the dashboard."
              : health?.chatMode === "datasource"
                ? "Query published datasources with natural language."
                : "Select a workbook, then explore sheets, views, and data with AI."}
          </p>

          {extensionMode && isWorkbookMode && health?.ok && (
            <div className="workbook-card workbook-card--extension">
              {extensionLoading ? (
                <div className="workbook-card-loading">
                  <span className="spinner" />
                  Resolving workbook from Tableau…
                </div>
              ) : extensionError ? (
                <p className="workbook-card-error" role="alert">
                  {extensionError}
                </p>
              ) : selectedWorkbook ? (
                <div className="workbook-card-body">
                  <span className="workbook-card-icon" aria-hidden="true">
                    📁
                  </span>
                  <div>
                    <div className="workbook-card-title">{workbookLabel(selectedWorkbook)}</div>
                    {extensionContext?.dashboardName && (
                      <div className="workbook-card-meta">
                        Dashboard · {extensionContext.dashboardName}
                        {extensionContext.worksheetNames.length > 0 &&
                          ` · ${extensionContext.worksheetNames.length} sheet${extensionContext.worksheetNames.length === 1 ? "" : "s"}`}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {!extensionMode && isWorkbookMode && health?.ok && (
            <div className="workbook-card">
              <label className="workbook-card-label" htmlFor="workbook-select">
                Active workbook
              </label>
              <div className="workbook-picker-row">
                <select
                  id="workbook-select"
                  className="workbook-select"
                  value={selectedWorkbookId}
                  onChange={(e) => {
                    setSelectedWorkbookId(e.target.value);
                    setError(null);
                  }}
                  disabled={workbooksLoading || loading}
                >
                  <option value="">
                    {workbooksLoading ? "Loading workbooks…" : "Choose a workbook to analyze…"}
                  </option>
                  {workbooks.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.projectName ? `${displayName(w.name)} (${w.projectName})` : displayName(w.name)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => void loadWorkbooks()}
                  disabled={workbooksLoading || loading}
                  title="Refresh workbook list"
                  aria-label="Refresh workbook list"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
              {workbooksError && <p className="workbook-card-error">{workbooksError}</p>}
              {selectedWorkbook && (
                <p className="workbook-card-hint">
                  Ready to analyze <strong>{workbookLabel(selectedWorkbook)}</strong>
                </p>
              )}
            </div>
          )}

          <StatusPill
            health={health}
            extensionLoading={extensionLoading}
            extensionMode={extensionMode}
            selectedWorkbook={selectedWorkbook}
            workbooksCount={workbooks.length}
            isWorkbookMode={isWorkbookMode}
          />
        </header>

        <main className="messages" role="log" aria-live="polite" aria-relevant="additions">
          {messages.length === 0 && !loading && (
            <div className="empty-state">
              {isWorkbookMode && !selectedWorkbook && health?.ok && !extensionLoading ? (
                <div className="empty-state-card">
                  <div className="empty-state-icon">📂</div>
                  <h2>Select a workbook</h2>
                  <p>
                    {extensionMode
                      ? extensionError
                        ? "Fix workbook resolution above to start chatting."
                        : "Waiting for workbook context from Tableau…"
                      : "Choose a workbook above to unlock sheet exploration and data questions."}
                  </p>
                </div>
              ) : starters.length > 0 ? (
                <>
                  <div className="empty-state-hero">
                    <h2>What would you like to know?</h2>
                    <p>
                      Ask about sheets, views, or metrics
                      {selectedWorkbook ? ` in ${displayName(selectedWorkbook.name)}` : ""}.
                    </p>
                  </div>
                  <div className="capability-grid">
                    {CAPABILITIES.map((c) => (
                      <div key={c.label} className="capability-card">
                        <span className="capability-icon" aria-hidden="true">
                          {c.icon}
                        </span>
                        <div>
                          <div className="capability-label">{c.label}</div>
                          <div className="capability-desc">{c.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="starters">
                    <p className="starters-title">Suggested questions</p>
                    <div className="starter-grid">
                      {starters.map((q, i) => (
                        <button
                          key={q}
                          type="button"
                          className="starter-card"
                          onClick={() => void sendMessage(q)}
                          disabled={
                            !health?.ok || (isWorkbookMode && !selectedWorkbook) || extensionLoading
                          }
                          style={{ animationDelay: `${i * 60}ms` }}
                        >
                          <span className="starter-card-icon" aria-hidden="true">
                            →
                          </span>
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`msg-block msg-block--${m.role}`}
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <div className="msg-avatar" aria-hidden="true">
                {m.role === "user" ? "You" : "AI"}
              </div>
              <div className="msg-content">
                {m.role === "assistant" && m.steps && m.steps.length > 0 && (
                  <ToolSteps steps={m.steps} timing={m.timing} />
                )}
                <div
                  className={`msg msg--${m.role}${error && i === messages.length - 1 && m.role === "assistant" ? " msg--error" : ""}`}
                >
                  {m.content}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="msg-block msg-block--assistant">
              <div className="msg-avatar" aria-hidden="true">
                AI
              </div>
              <div className="msg msg--assistant msg--loading">
                <span className="typing-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                Running Tableau MCP tools…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </main>

        {error && messages.length === 0 && (
          <p className="composer-error" role="alert">
            {error}
          </p>
        )}

        <footer className="composer">
          <div className="composer-inner">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                health?.chatMode === "datasource"
                  ? "Ask about a published datasource…"
                  : extensionLoading
                    ? "Resolving workbook…"
                    : selectedWorkbook
                      ? `Ask about ${displayName(selectedWorkbook.name)}…`
                      : extensionMode
                        ? "Waiting for workbook context…"
                        : "Select a workbook, then ask a question…"
              }
              rows={1}
              disabled={loading || extensionLoading}
              aria-label="Message"
            />
            <button
              type="button"
              className="btn-send"
              onClick={() => void send()}
              disabled={!canSend}
              aria-label="Send message"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <p className="composer-hint">
            <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for new line
          </p>
        </footer>
      </div>
    </div>
  );
}
