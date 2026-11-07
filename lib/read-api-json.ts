export async function readApiJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => {
    throw new Error(response.status === 401 ? "登录已过期，请重新登录。" : fallback);
  });
  if (!response.ok) {
    const message = body?.message;
    throw new Error(typeof message === "string" && message ? message : fallback);
  }
  return body as T;
}
