import { loadState, logEvent, SAVE_CODE, saveState } from "@/lib/store";

const MAX_BYTES = 1_000_000;

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!SAVE_CODE.test(code)) return Response.json({ error: "invalid save code" }, { status: 400 });
  const state = await loadState(code);
  return state ? Response.json({ state }) : Response.json({ error: "not found" }, { status: 404 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return Response.json({ error: "payload too large" }, { status: 413 });
  const body = JSON.parse(raw || "null") as { code?: string; state?: unknown; event?: Record<string, unknown> } | null;
  if (!body?.code || !SAVE_CODE.test(body.code)) return Response.json({ error: "invalid save code" }, { status: 400 });
  try {
    await Promise.all([
      body.state ? saveState(body.code, body.state) : null,
      body.event ? logEvent(body.code, body.event) : null,
    ]);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
