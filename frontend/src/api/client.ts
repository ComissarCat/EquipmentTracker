import axios from 'axios';

// Базовый URL API берётся из переменной окружения сборки (см. Dockerfile фронтенда) —
// это позволяет фронтенду в контейнере ходить к бэкенду по имени сервиса docker-compose
// на этапе разработки и по публичному адресу в проде.
export const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8080';

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
