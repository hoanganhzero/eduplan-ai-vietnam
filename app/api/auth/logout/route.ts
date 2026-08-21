import { clearSessionCookie, deleteRequestSession } from "../../../auth";

export async function POST(request: Request) {
  try { await deleteRequestSession(request); } catch {}
  return Response.json({ signedOut: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
}
