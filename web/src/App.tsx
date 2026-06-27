import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { readJson } from "./api";
import { apiUrl } from "./config";
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

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<{
    ok: boolean;
    healthError?: string;
    hasOpenAi?: boolean;
    chatMode?: "workbook" | "datasource";
    tableauSignInOk?: boolean;
    tableauHint?: string;
  } | null>(null);
  const [extensionContext, setExtensionContext] = useState<ExtensionContext | null>(null);
  const [workbookLoading, setWorkbookLoading] = useState(true);
  const [workbookError, setWorkbookError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isWorkbookMode = health?.chatMode !== "datasource";
  const selectedWorkbook = extensionContext?.workbook ?? null;

  useEffect(() => {
    fetch(apiUrl("/api/health"))
      .then(async (r) => {
        try {
          return await readJson<{
            ok: boolean;
            hasOpenAi?: boolean;
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
    if (!health?.ok || !isWorkbookMode) {
      if (!isWorkbookMode) setWorkbookLoading(false);
      return;
    }

    let cancelled = false;
    setWorkbookLoading(true);
    setWorkbookError(null);

    loadExtensionContext()
      .then((ctx) => {
        if (!cancelled) {
          setExtensionContext(ctx);
          setWorkbookError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setWorkbookError(e instanceof Error ? e.message : String(e));
          setExtensionContext(null);
        }
      })
      .finally(() => {
        if (!cancelled) setWorkbookLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [health?.ok, isWorkbookMode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      if (isWorkbookMode && !selectedWorkbook) {
        setError("Waiting for workbook ID from this dashboard…");
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
            extensionMode: true,
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
    [loading, messages, isWorkbookMode, selectedWorkbook]
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

  const starters = selectedWorkbook ? workbookStarters(selectedWorkbook.name) : [];
  const workbookReady = !isWorkbookMode || !!selectedWorkbook;
  const canSend = !loading && !!input.trim() && health?.ok && workbookReady && !workbookLoading;

  const statusMessage = (() => {
    if (health === null) return "Checking connection…";
    if (health.healthError) return health.healthError;
    if (workbookLoading) return "Resolving workbook ID…";
    if (!health.ok) {
      if (health.tableauSignInOk === false && health.tableauHint) return health.tableauHint;
      if (!health.hasOpenAi) return "Set OPENAI_API_KEY on the server";
      return "Set Tableau PAT on the server";
    }
    if (selectedWorkbook) {
      return `Connected · ${displayName(selectedWorkbook.name)}`;
    }
    return "Connected";
  })();

  const statusClass =
    health === null || workbookLoading
      ? "status-pill--loading"
      : health?.healthError || workbookError || !health?.ok
        ? "status-pill--error"
        : "status-pill--ok";

  return (
    <div className="app-shell app-shell--extension">
      <div className="app app-extension">
        <header className="app-header">
          <div className="header-top">
            <div className="brand">
              <BrandMark />
              <div className="brand-text">
                <h1>Tableau MCP</h1>
                <p className="brand-tagline">Dashboard Extension</p>
              </div>
            </div>
            <div className="header-actions">
              {messages.length > 0 && (
                <button type="button" className="btn-ghost" onClick={clearChat} disabled={loading}>
                  Clear chat
                </button>
              )}
            </div>
          </div>

          <p className="header-subtitle">
            Ask questions about this workbook — workbook ID is detected from the dashboard.
          </p>

          {isWorkbookMode && health?.ok && (
            <div className="workbook-card workbook-card--extension">
              {workbookLoading ? (
                <div className="workbook-card-loading">
                  <span className="spinner" />
                  Resolving workbook ID from this dashboard…
                </div>
              ) : workbookError ? (
                <p className="workbook-card-error" role="alert">
                  {workbookError}
                </p>
              ) : selectedWorkbook ? (
                <div className="workbook-card-body">
                  <span className="workbook-card-icon" aria-hidden="true">
                    📁
                  </span>
                  <div>
                    <div className="workbook-card-title">{workbookLabel(selectedWorkbook)}</div>
                    <div className="workbook-card-meta">
                      Workbook ID · {selectedWorkbook.id}
                      {extensionContext?.source === "settings" ? " · saved in extension" : ""}
                    </div>
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

          <div className={`status-pill ${statusClass}`}>
            <span className="status-dot" />
            {statusMessage}
          </div>
        </header>

        <main className="messages" role="log" aria-live="polite" aria-relevant="additions">
          {messages.length === 0 && !loading && (
            <div className="empty-state">
              {isWorkbookMode && !selectedWorkbook && health?.ok && !workbookLoading ? (
                <div className="empty-state-card">
                  <div className="empty-state-icon">📂</div>
                  <h2>Workbook not ready</h2>
                  <p>
                    {workbookError
                      ? "Could not resolve workbook ID for this dashboard."
                      : "Detecting workbook ID from Tableau…"}
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
                          disabled={!health?.ok || !selectedWorkbook || workbookLoading}
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
                workbookLoading
                  ? "Resolving workbook ID…"
                  : selectedWorkbook
                    ? `Ask about ${displayName(selectedWorkbook.name)}…`
                    : "Waiting for workbook ID…"
              }
              rows={1}
              disabled={loading || workbookLoading}
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
