# Tableau dashboard extension

This folder contains the **Tableau dashboard extension** manifest for MCP Chat.

## How it works

1. Tableau loads your UI in an iframe from the plain URL in `.trex` (no query params).
2. On start, the app reads the workbook slug from the **dashboard URL** (same as `?contentUrl=...` in browser tests), e.g. `.../views/AccountsPayableAI-MCP/ExecutiveSummary` → `AccountsPayableAI-MCP`.
3. It calls `GET /api/workbooks/resolve?contentUrl=...` to get the workbook **LUID**.
4. If the Tableau Extensions API is available, it can also resolve by workbook name and cache the id per dashboard.
5. Chat requests include `selectedWorkbook` and `extensionMode: true`.

**Do not** put `?contentUrl=OneWorkbook` in `.trex` — that hardcodes a single workbook. Use a plain URL; each dashboard is detected automatically.

## Setup

### 1. Build and run the server

```bash
npm run build
npm run start
```

API + UI: http://localhost:8787

### 2. Edit the manifest URL

In `TableauMcpChat.trex`, set `<source-location><url>` to where you host the app:

- **Local Tableau Desktop:** `http://localhost:8787/`
- **Tableau Server / Cloud:** `https://your-server.example.com/` (HTTPS required)

If the API is on a **different host** than the UI, set `VITE_API_BASE` when building:

```bash
VITE_API_BASE=https://api.example.com npm run build
```

### 3. Add to a dashboard

1. Open a workbook in Tableau Desktop or Server.
2. Edit a dashboard → drag **Extension** onto the canvas.
3. Choose **TableauMcpChat.trex** (this file).
4. Resize the extension zone; chat scopes to that workbook automatically.

## Test without Tableau

With the dev server running:

```
http://localhost:5173/?contentUrl=AccountsPayableAI-MCP
```

Same resolve path the extension uses on start (slug from dashboard URL).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Tableau Extensions API not available" | Open via dashboard extension, not a normal browser tab |
| "No workbook matched name=..." | Workbook name must match Tableau exactly; check `/api/workbooks` |
| Extension blank on Server | Use HTTPS; add URL to Server safe list |
| API errors from extension | Set `VITE_API_BASE` if API is not same origin as UI |
