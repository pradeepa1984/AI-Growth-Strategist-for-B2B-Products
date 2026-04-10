import { useState, useCallback } from "react";
import { apiPost, apiGet } from "../api/client";

/**
 * useApiCall — reusable hook for API calls with loading, error, and retry.
 *
 * @param {number} maxRetries  How many times to retry on failure (default 1).
 *                             Set to 0 to disable retries.
 *
 * Usage:
 *   const { call, loading, error, clearError } = useApiCall();
 *   const data = await call("post", "/api/market-intelligence", { company_url: url });
 */
export function useApiCall({ maxRetries = 1 } = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);   // string or null

  const call = useCallback(
    async (method, path, body = undefined) => {
      setLoading(true);
      setError(null);

      const invoke = method === "get"
        ? () => apiGet(path)
        : () => apiPost(path, body);

      let lastError = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await invoke();
          setLoading(false);
          return result;
        } catch (err) {
          lastError = err;

          // Don't retry client errors (4xx) — they won't change on retry.
          const isClientError = err.status >= 400 && err.status < 500;
          if (isClientError || attempt === maxRetries) break;

          // Exponential back-off: 800ms, 1600ms, ...
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }

      setError(lastError?.message || "Something went wrong. Please try again.");
      setLoading(false);
      return null;
    },
    [maxRetries]
  );

  const clearError = useCallback(() => setError(null), []);

  return { call, loading, error, clearError };
}
