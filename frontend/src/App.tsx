import React from 'react';
import { Navigate, Route, Routes, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { MainPage } from './pages/MainPage';
import { AdminAccountsPage } from './pages/AdminAccountsPage';
import { CatalogsPage } from './pages/CatalogsPage';
import { HistoryPage } from './pages/HistoryPage';
import { WriteOffsPage } from './pages/WriteOffsPage';
import { EquipmentUnitDetailPage } from './pages/EquipmentUnitDetailPage';
import { ExportPage } from './pages/ExportPage';
import { RepairsPage } from './pages/RepairsPage';
import { roleLabel } from './utils/roles';

function RequireRole({ role, children }: { role: 'operator' | 'administrator'; children: React.ReactNode }) {
  const { isOperator, isAdministrator, user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  const allowed = role === 'operator' ? isOperator : isAdministrator;
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Для страниц, доступных любому авторизованному пользователю независимо от роли
// (в отличие от RequireRole, здесь не важно, Оператор это или Администратор — важен сам факт входа)
function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdministrator } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
          Учёт техники
        </Link>
        {user && (
        <nav>
          <Link to="/">Главная</Link>
          <Link to="/export">Экспорт</Link>
          <Link to="/repairs">Ремонты</Link>
          <Link to="/catalogs">Справочники</Link>
          <Link to="/write-offs">Списания</Link>
          <Link to="/history">История</Link>
          {isAdministrator && <Link to="/admin/accounts">Учётные записи</Link>}
        </nav>
        )}
        <div className="header-right">
          {user ? (
            <>
              <span className="muted">
                {user.fullName} ({user.roles.map(roleLabel).join(', ') || 'без роли'})
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

// Анонимного доступа нет: все страницы, кроме входа, требуют авторизации. «Только чтение»,
// Оператор и Администратор видят одни и те же страницы; права на изменения проверяются кнопками
// (isOperator/isAdministrator) в самих страницах и, главное, на сервере.
const authed = (page: React.ReactNode) => <RequireAuth>{page}</RequireAuth>;

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={authed(<MainPage />)} />
        <Route path="/equipment-units/:id" element={authed(<EquipmentUnitDetailPage />)} />
        <Route path="/export" element={authed(<ExportPage />)} />
        <Route path="/repairs" element={authed(<RepairsPage />)} />
        <Route path="/catalogs" element={authed(<CatalogsPage />)} />
        <Route path="/write-offs" element={authed(<WriteOffsPage />)} />
        <Route path="/history" element={authed(<HistoryPage />)} />
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
