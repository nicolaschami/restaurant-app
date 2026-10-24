import axios from 'axios';

// The API is on the SAME address as the screens (cloud-ready, 2026-10-26):
//   - on the server, RES delivers both → "/api" on that address;
//   - in development, Vite forwards /api to the RES server (vite.config.ts).
// VITE_API_URL can point elsewhere if the screens are ever hosted separately.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

// The live connection (WebSocket) on the same machine as the API: "ws://" on http,
// "wss://" on https. Example: wsUrl('/ws?token=…').
export function wsUrl(path: string): string {
  const u = new URL(String(api.defaults.baseURL || '/api'), window.location.href);
  return `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}${path}`;
}

// Automatically attach JWT token if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
// A login that is no longer valid (user deactivated or removed, token refused):
// back to the login page instead of errors on every screen (2026-10-26).
// Not for the login calls themselves (a wrong password or PIN also answers 401).
// A renewed login (the server sends one once a day while the app is used) replaces
// the stored one, so a POS or kitchen screen in service is never logged out.
api.interceptors.response.use(
  (res) => {
    const fresh = res.headers?.['x-new-token'];
    if (fresh && localStorage.getItem('token')) localStorage.setItem('token', String(fresh));
    return res;
  },
  (err) => {
    const url = String(err?.config?.url || '');
    if (err?.response?.status === 401 && !url.startsWith('/auth/') && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      window.location.reload();
    }
    return Promise.reject(err);
  }
);
