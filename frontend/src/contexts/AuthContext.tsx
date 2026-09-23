import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { AuthUser } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  login: (login: string, password: string) => Promise<void>;
  logout: () => void;
  isOperator: boolean;
  isAdministrator: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem('auth');
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (user) localStorage.setItem('auth', JSON.stringify(user));
    else localStorage.removeItem('auth');
  }, [user]);

  // Роли, сохранённые при входе, могли измениться (администратор выдал/снял роль) — при открытии
  // приложения берём актуальные с сервера, чтобы интерфейс показывал верный набор кнопок.
  // Отозванный токен (сменён пароль, удалена учётная запись) даст 401 — клиент сам отправит на вход.
  const token = user?.token;
  useEffect(() => {
    if (!token) return;
    apiClient
      .get<{ login: string; fullName: string; roles: string[] }>('/api/auth/me')
      .then((res) =>
        setUser((prev) =>
          prev && prev.token === token
            ? { ...prev, login: res.data.login, fullName: res.data.fullName, roles: res.data.roles }
            : prev
        )
      )
      .catch(() => {
        /* сетевые ошибки не должны мешать работе с уже сохранёнными данными */
      });
  }, [token]);

  const login = async (loginValue: string, password: string) => {
    const res = await apiClient.post('/api/auth/login', { login: loginValue, password });
    const authUser: AuthUser = {
      token: res.data.token,
      login: res.data.login,
      fullName: res.data.fullName,
      roles: res.data.roles
    };
    setUser(authUser);
  };

  const logout = () => setUser(null);

  const isOperator = !!user && (user.roles.includes('Operator') || user.roles.includes('Administrator'));
  const isAdministrator = !!user && user.roles.includes('Administrator');

  return (
    <AuthContext.Provider value={{ user, login, logout, isOperator, isAdministrator }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
