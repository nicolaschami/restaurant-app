import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://127.0.0.1:3000/api',
});

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
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = String(err?.config?.url || '');
    if (err?.response?.status === 401 && !url.startsWith('/auth/') && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      window.location.reload();
    }
    return Promise.reject(err);
  }
);
