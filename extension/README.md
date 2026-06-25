# Tableau dashboard extension

This folder contains the **Tableau dashboard extension** manifest for MCP Chat.

## How it works

1. Tableau loads your built UI in an iframe (from `source-location` in the `.trex` file).
2. The extension calls the Tableau Extensions API to read the **current workbook name**.
3. The UI calls `GET /api/workbooks/resolve?name=...` to map that name to the MCP **workbook LUID**.
4. Chat requests include `selectedWorkbook` and `extensionMode: true` — no dropdown needed.

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
http://localhost:5173/?extension=1&workbookName=Your+Workbook+Name
```

Uses the same resolve flow as the real extension (workbook name must match Tableau).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Tableau Extensions API not available" | Open via dashboard extension, not a normal browser tab |
| "No workbook matched name=..." | Workbook name must match Tableau exactly; check `/api/workbooks` |
| Extension blank on Server | Use HTTPS; add URL to Server safe list |
| API errors from extension | Set `VITE_API_BASE` if API is not same origin as UI |
