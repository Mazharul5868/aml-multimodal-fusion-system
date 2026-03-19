const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const API_V1 = "/api/v1";

export async function apiRequest(path, options = {}) {
  const url = `${BASE_URL}${API_V1}${path}`;
  const headers = { ...(options.headers || {}) };

  // Only set JSON Content-Type when we actually send a body
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, { ...options, headers });

  // Attempt to parse JSON, but tolerate empty responses
  const text = await res.text();
  const data = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const message =
      (data && data.detail) ||
      (typeof data === "string" && data) ||
      `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
