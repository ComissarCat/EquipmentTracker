import axios from 'axios';

// По умолчанию запросы идут на тот же origin: в проде /api/ проксирует nginx фронтенда,
// в dev — прокси Vite (см. vite.config.ts). VITE_API_BASE_URL нужен только если API
// живёт на другом адресе.
export const API_BASE_URL: string = (import.meta as any).env?.VITE_API_BASE_URL ?? '';

export const apiClient = axios.create({
  baseURL: API_BASE_URL
});

apiClient.interceptors.request.use((config) => {
  const raw = localStorage.getItem('auth');
  if (raw) {
    const auth = JSON.parse(raw);
    if (auth?.token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${auth.token}`;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('auth');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
