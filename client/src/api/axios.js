import axios from 'axios';
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000', headers: { 'Content-Type': 'application/json' } });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sprint_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 7-day token eventually expires. Without this the app renders empty boards
// forever with no way out; instead, clear the session and bounce to /login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    const isAuthAttempt = url.includes('/api/auth/login') || url.includes('/api/auth/register');
    if (status === 401 && !isAuthAttempt) {
      localStorage.removeItem('sprint_token');
      localStorage.removeItem('sprint_user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login?expired=1');
      }
    }
    return Promise.reject(error);
  }
);
export default api;
