/**
 * Centralized API fetch client with automatic Bearer Token, Credentials & Memory Fallback
 * Guarantees cross-browser and cross-proxy compatibility (Vercel -> Render)
 */

const TOKEN_KEY = 'pantry_token';
let memoryToken: string | null = null;

export function getAuthToken(): string | null {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      const stored = localStorage.getItem(TOKEN_KEY);
      if (stored) return stored;
    }
  } catch {
    // Ignore localStorage access restrictions in private mode
  }
  return memoryToken;
}

export function setAuthToken(token: string | null): void {
  memoryToken = token;
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
  } catch {
    // Ignore
  }
}

export function clearAuthToken(): void {
  memoryToken = null;
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore
  }
}

export async function apiFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers || {});

  // Automatically attach Bearer token if available
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Ensure JSON content-type default for objects
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    try {
      JSON.parse(init.body);
      headers.set('Content-Type', 'application/json');
    } catch {
      // not JSON
    }
  }

  const enhancedInit: RequestInit = {
    ...init,
    credentials: init.credentials || 'include',
    headers,
  };

  return fetch(input, enhancedInit);
}
