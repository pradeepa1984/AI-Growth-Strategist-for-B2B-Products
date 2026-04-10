/**
 * Central API client for AI Growth Strategist.
 *
 * All fetch calls go through here so:
 *  - The API base URL is configured in one place.
 *  - Error parsing is consistent — always throws with a user-facing message.
 *  - The standard { success, error: { code, message } } shape is handled.
 *  - Auth token is automatically attached from Cognito session.
 */

import { getToken } from "../auth/cognito";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Parse any failed response into a clean Error with a user-facing message.
 * Handles: our standard shape, FastAPI default shape, and plain text.
 */
async function parseError(res) {
  let message = `Request failed (HTTP ${res.status})`;
  let code = `HTTP_${res.status}`;

  try {
    const body = await res.json();

    // Our standard shape: { success: false, error: { code, message } }
    if (body?.error?.message) {
      message = body.error.message;
      code = body.error.code || code;

    // FastAPI default shape before our handler runs: { detail: "..." or { code, message } }
    } else if (body?.detail) {
      const detail = body.detail;
      if (typeof detail === "string") {
        message = detail;
      } else if (detail?.message) {
        message = detail.message;
        code = detail.code || code;
      }
    }
  } catch {
    // Body wasn't JSON — keep the default message
  }

  const err = new Error(message);
  err.code = code;
  err.status = res.status;
  return err;
}

export async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw await parseError(res);
  }
  return res.json();
}

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });

  if (!res.ok) {
    throw await parseError(res);
  }
  return res.json();
}

export { API_BASE };
