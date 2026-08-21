import { getRequestAccount } from "../../auth";

export async function GET(request: Request) {
  const identity = await getRequestAccount(request);
  if (!identity?.account) return Response.json({ error: "Cần đăng nhập" }, { status: 401 });
  const { env } = await import("cloudflare:workers");
  const values = env as unknown as Record<string, unknown>;
  return Response.json({ services: {
    supabase: Boolean(values.SUPABASE_URL && values.SUPABASE_PUBLISHABLE_KEY && values.SUPABASE_APP_SECRET),
    kira: Boolean(values.KIRA_API_KEY),
    storage: Boolean(values.BUCKET),
    gamma: Boolean(values.GAMMA_API_KEY),
    zalo: Boolean(values.ZALO_ACCESS_TOKEN),
  } });
}
