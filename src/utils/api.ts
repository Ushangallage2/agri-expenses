/** Shared Netlify Functions base path (works via netlify dev :8888 or Vite proxy :5173). */
export const API = "/.netlify/functions";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path.startsWith("/") ? path : `/${path}`}`, {
    ...options,
    credentials: "include",
  });
  return res;
}
