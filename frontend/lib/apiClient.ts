// Talks to the FastAPI backend through this app's own same-origin proxy
// (see app/api/backend/[...path]/route.ts) rather than calling the backend
// directly from the browser. The proxy requires a signed-in session and
// attaches the backend admin token server-side, so the token never reaches
// the client bundle and the site password actually gates the data API too.
const baseUrl = "/api/backend";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {})
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text}`);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" })
};
