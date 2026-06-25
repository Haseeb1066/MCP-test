/** Read JSON from a fetch Response; empty/non-JSON bodies get a clear error (common when API is down). */
export async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();

  if (!trimmed) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(
        "API server unreachable. Run `npm run dev` (Python API on :8787 + UI on :5173), or `pip install -r requirements.txt` then `npm run dev:api`."
      );
    }
    throw new Error(`Empty response from server (${res.status} ${res.statusText}).`);
  }

  try {
    const data = JSON.parse(trimmed) as T;
    if (!res.ok) {
      const errBody = data as { detail?: string; error?: string };
      const msg = errBody.detail ?? errBody.error;
      if (msg) throw new Error(msg);
    }
    return data;
  } catch (e) {
    if (e instanceof Error && e.message !== trimmed && !e.message.startsWith("Expected JSON")) {
      throw e;
    }
    throw new Error(
      `Expected JSON but got ${res.status} ${res.statusText}: ${trimmed.slice(0, 240)}${trimmed.length > 240 ? "…" : ""}`
    );
  }
}
