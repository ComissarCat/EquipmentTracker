import React from 'react';
import { Navigate, Route, Routes, Link, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { MainPage } from './pages/MainPage';
import { AdminAccountsPage } from './pages/AdminAccountsPage';
import { CatalogsPage } from './pages/CatalogsPage';
import { HistoryPage } from './pages/HistoryPage';
import { WriteOffsPage } from './pages/WriteOffsPage';
import { EquipmentUnitDetailPage } from './pages/EquipmentUnitDetailPage';
import { ExportPage } from './pages/ExportPage';

function RequireRole({ role, children }: { role: 'operator' | 'administrator'; children: React.ReactNode }) {
  const { isOperator, isAdministrator, user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const allowed = role === 'operator' ? isOperator : isAdministrator;
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Для страниц, доступных любому авторизованному пользователю независимо от роли
// (в отличие от RequireRole, здесь не важно, Оператор это или Администратор — важен сам факт входа)
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isOperator, isAdministrator } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
          Учёт техники
        </Link>
        <nav>
          <Link to="/">Главная</Link>
          <Link to="/export">Экспорт</Link>
          {isOperator && <Link to="/catalogs">Справочники</Link>}
          {isOperator && <Link to="/write-offs">Списания</Link>}
          {isOperator && <Link to="/history">История</Link>}
          {isAdministrator && <Link to="/admin/accounts">Учётные записи</Link>}
        </nav>
        <div className="header-right">
          {user ? (
            <>
              <span className="muted">
                {user.fullName} ({user.roles.join(', ') || 'без роли'})
              </span>
              <button
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                Выйти
              </button>
            </>
          ) : (
            <Link to="/login">Войти</Link>
          )}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<MainPage />} />
        <Route
          path="/equipment-units/:id"
          element={
            <RequireAuth>
              <EquipmentUnitDetailPage />
            </RequireAuth>
          }
        />
        <Route path="/export" element={<ExportPage />} />
        <Route
          path="/catalogs"
          element={
            <RequireRole role="operator">
              <CatalogsPage />
            </RequireRole>
          }
        />
        <Route
          path="/write-offs"
          element={
            <RequireRole role="operator">
              <WriteOffsPage />
            </RequireRole>
          }
        />
        <Route
          path="/history"
          element={
            <RequireRole role="operator">
              <HistoryPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/accounts"
          element={
            <RequireRole role="administrator">
              <AdminAccountsPage />
            </RequireRole>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
