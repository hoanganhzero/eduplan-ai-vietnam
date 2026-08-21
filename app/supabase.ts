type RpcError = {
  message?: string;
  details?: string;
  hint?: string;
};

async function runtimeConfig() {
  const { env } = await import("cloudflare:workers");
  const values = env as unknown as Record<string, string | undefined>;
  const url = values.SUPABASE_URL;
  const publishableKey = values.SUPABASE_PUBLISHABLE_KEY;
  const appSecret = values.SUPABASE_APP_SECRET;
  if (!url || !publishableKey) {
    throw new Error("Supabase chưa được cấu hình trên máy chủ");
  }
  return { url: url.replace(/\/$/, ""), publishableKey, appSecret };
}

async function rpc<T>(functionName: string, payload: Record<string, unknown>) {
  const { url, publishableKey } = await runtimeConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = (await response.json().catch(() => null)) as T | RpcError | null;
  if (!response.ok) {
    const error = result as RpcError | null;
    throw new Error(error?.message || error?.details || "Không thể kết nối cơ sở dữ liệu");
  }
  return result as T;
}

export function publicRpc<T>(functionName: string, payload: Record<string, unknown>) {
  return rpc<T>(functionName, payload);
}

export async function serverRpc<T>(action: string, payload: Record<string, unknown> = {}) {
  const { appSecret } = await runtimeConfig();
  if (!appSecret) throw new Error("Khóa bảo mật Supabase chưa được cấu hình");
  return rpc<T>("eduplan_server", {
    p_secret: appSecret,
    p_action: action,
    p_payload: payload,
  });
}

export async function platformSessionRpc<T>(email: string) {
  const { appSecret } = await runtimeConfig();
  if (!appSecret) throw new Error("Khóa bảo mật Supabase chưa được cấu hình");
  return rpc<T>("eduplan_platform_session", {
    p_secret: appSecret,
    p_email: email,
  });
}

export async function learningRpc<T>(action: string, payload: Record<string, unknown> = {}) {
  const { appSecret } = await runtimeConfig();
  if (!appSecret) throw new Error("Khóa bảo mật Supabase chưa được cấu hình");
  return rpc<T>("eduplan_learning", {
    p_secret: appSecret,
    p_action: action,
    p_payload: payload,
  });
}

export async function workspaceRpc<T>(action: string, payload: Record<string, unknown> = {}) {
  const { appSecret } = await runtimeConfig();
  if (!appSecret) throw new Error("Khóa bảo mật Supabase chưa được cấu hình");
  return rpc<T>("eduplan_workspace", {
    p_secret: appSecret,
    p_action: action,
    p_payload: payload,
  });
}
