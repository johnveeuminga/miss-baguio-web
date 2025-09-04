const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

let _onUnauthorized: (() => void) | null = null;

export function onUnauthorized(cb: () => void) {
  _onUnauthorized = cb;
}

async function handleResponse(res: Response) {
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    // if unauthorized, call registered callback
    if (res.status === 401 && typeof _onUnauthorized === "function") {
      try {
        _onUnauthorized();
      } catch {
        // ignore
      }
    }
    throw json || { message: res.statusText };
  }
  return json;
}

export async function post(
  path: string,
  body: Record<string, unknown>,
  token?: string
) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function get(path: string, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
  });
  return handleResponse(res);
}

export async function me(token?: string) {
  return get("/me", token);
}
