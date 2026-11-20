/**
 * Thin client for the MyToDoList REST API.
 */

/** Error returned by the API, carrying the HTTP status. */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Sends a request to the API and returns the parsed JSON body.
 * Every request carries the `X-MyToDoList-Request` header required by the
 * server's CSRF protection.
 * @param {string} url
 * @param {{ method?: string, body?: unknown }} [options] `body` is JSON-encoded.
 * @throws {ApiError} On any non-2xx response.
 */
export async function apiRequest(url, { method = 'GET', body } = {}) {
  const headers = { 'X-MyToDoList-Request': '1' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error || `Erreur réseau (${response.status})`, response.status);
  }
  return data;
}

export const api = {
  me: () => apiRequest('/api/auth/me'),
  login: credentials => apiRequest('/api/auth/login', { method: 'POST', body: credentials }),
  register: credentials => apiRequest('/api/auth/register', { method: 'POST', body: credentials }),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST' }),
  getState: () => apiRequest('/api/state'),
  /** @param {{ tabs: object[], lists: object[], tasks: object[], revision: number }} snapshot */
  saveState: snapshot => apiRequest('/api/state', { method: 'PUT', body: snapshot })
};
