import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Куда вернуть пользователя после входа: страница, которую он пытался открыть (передаётся через
// state при переходе с защищённой страницы или через ?from= при истёкшей сессии). Принимаем только
// внутренние пути приложения — иначе через ссылку с ?from=https://... можно было бы увести на чужой сайт.
function redirectTarget(location: { state: unknown; search: string }): string {
  const fromState = (location.state as { from?: unknown } | null)?.from;
  const candidate = typeof fromState === 'string' ? fromState : new URLSearchParams(location.search).get('from');
  if (candidate && candidate.startsWith('/') && !candidate.startsWith('//') && !candidate.startsWith('/login')) {
    return candidate;
  }
  return '/';
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(loginValue, password);
      navigate(redirectTarget(location), { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось выполнить вход');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="centered-page">
      <form className="login-form" onSubmit={handleSubmit}>
        <h1>Учёт техники</h1>
        <p className="muted">Вход в систему</p>
        <label>
          Логин
          <input value={loginValue} onChange={(e) => setLoginValue(e.target.value)} autoFocus />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="error-text">{error}</div>}
        <button type="submit" disabled={loading}>
          {loading ? 'Вход...' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
