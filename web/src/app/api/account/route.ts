import { accountFor, cleanMe } from "@/lib/account";

/** "Connect my S-Pankki account" (demo: matched dataset customer). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const me = cleanMe(body?.me);
  if (!me) return Response.json({ error: "incomplete profile" }, { status: 400 });
  return Response.json(accountFor(me));
}
