# Tableau MCP Chat

Ask questions about Tableau workbooks (dashboards/sheets) in a ChatGPT-style UI, powered by Tableau MCP and OpenAI.

## Prerequisites

- **Python 3.9+** with `pip` (**3.10+ on Windows**)
- **Node.js 18+** with `npm` — must be on PATH (`node`, `npx` work in Command Prompt)
- A `.env` file with your keys (see `.env.example`)

## Windows setup

1. Install [Python](https://www.python.org/downloads/) — check **“Add python to PATH”**.
2. Install [Node.js LTS](https://nodejs.org/) — includes `npx`.
3. In **Command Prompt** or **PowerShell** (not only Git Bash):

```bat
cd E:\MCP\MCP
copy .env.example .env
REM edit .env with your keys

pip install -r requirements.txt
npm install
npm run dev
```

Or double-click `scripts\dev-windows.bat` after setup.

4. Open **http://localhost:5173**

**Checks if workbooks fail:**

```bat
python -c "import shutil; print('npx:', shutil.which('npx.cmd') or shutil.which('npx'))"
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8787
```

In another terminal: `curl http://127.0.0.1:8787/api/workbooks`

**Note:** Use `python` on Windows (not `python3`). Scripts in `package.json` use `python` for this reason.

## Setup (once)

```bash
cd /path/to/mcp2

cp .env.example .env
# Edit .env: OPENAI_API_KEY, TABLEAU_SERVER, TABLEAU_SITE_NAME, TABLEAU_PAT_NAME, TABLEAU_PAT_VALUE

pip install -r requirements.txt
npm install
```

## Run (development)

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| UI | http://localhost:5173 |
| API | http://127.0.0.1:8787 (proxied as `/api` from the UI) |

1. Open http://localhost:5173  
2. Wait for **Connected — workbook mode**  
3. Pick a **workbook** from the dropdown  
4. Ask a question  

## Production (localhost)

```bash
npm run build
npm run start
```

Open http://localhost:8787 — API and built UI on one port.

## Tableau dashboard extension

Use the chat **inside a Tableau dashboard** — the workbook is detected automatically (no dropdown).

1. `npm run build && npm run start`
2. Edit `extension/TableauMcpChat.trex` — set `<source-location><url>` to your hosted URL (`http://localhost:8787/` for Desktop).
3. In Tableau: dashboard → **Extension** → select `extension/TableauMcpChat.trex`.

If API and UI are on different hosts, build with `VITE_API_BASE=https://your-api-host`.

**Test without Tableau:**

1. Pick **Sales (Sales)** in the dropdown on the normal page (stores workbook id).
2. Open `http://localhost:5173/?extension=1` — uses that selection automatically.

Or use any of:

```
http://localhost:5173/?extension=1&contentUrl=Sales
http://localhost:5173/?extension=1&workbookName=Sales%20(Sales)
http://localhost:5173/?extension=1&workbookId=ed6bafd2-7b3f-4387-83b1-dcc522efe841
```

Note: the dropdown label `Sales (Sales)` is **workbook · project** (with a space before `(`). Avoid a trailing `\` in the URL.

See `extension/README.md` for details.

## Main `.env` settings

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Chat |
| `TABLEAU_SERVER` | e.g. `https://nunomics.ai` |
| `TABLEAU_SITE_NAME` | Site content URL |
| `TABLEAU_PAT_NAME` / `TABLEAU_PAT_VALUE` | Personal access token |
| `TABLEAU_CHAT_MODE` | `workbook` (default) or `datasource` |
| `TABLEAU_SSL_VERIFY=0` | Self-signed Tableau cert |

## Project layout

```
backend/     Python FastAPI + Tableau MCP
web/         React UI (built to dist/web)
.env         Secrets (not committed)
```
