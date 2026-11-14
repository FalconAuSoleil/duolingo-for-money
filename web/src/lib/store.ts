import { get, put } from "@vercel/blob";

// Private Vercel Blob store (S3-compatible object storage), one folder per learner:
//   users/<code>/state.json             latest profile, path and progress (overwritten)
//   users/<code>/events/<ts>-<rand>.json one file per validated answer / finished lesson (append-only)

export const SAVE_CODE = /^MT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

const json = (data: unknown) => JSON.stringify(data);

export async function saveState(code: string, state: unknown) {
  await put(`users/${code}/state.json`, json(state), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

export async function loadState(code: string): Promise<unknown | null> {
  const res = await get(`users/${code}/state.json`, { access: "private", useCache: false });
  if (!res || res.statusCode !== 200) return null;
  return JSON.parse(await new Response(res.stream).text());
}

export async function logEvent(code: string, event: Record<string, unknown>) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  await put(`users/${code}/events/${ts}-${Math.random().toString(36).slice(2, 8)}.json`, json({ ...event, savedAt: new Date().toISOString() }), {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json",
  });
}
