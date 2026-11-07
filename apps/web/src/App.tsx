import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import type { Permission } from '@medequip/shared';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { HomePage } from './pages/HomePage';
import { UsersPage } from './pages/UsersPage';
import { AssetsPage } from './pages/AssetsPage';
import { AssetFormPage } from './pages/AssetFormPage';
import { AssetDetailPage } from './pages/AssetDetailPage';
import { LocationsPage } from './pages/LocationsPage';
import { LibraryPage } from './pages/LibraryPage';

/** Requires a signed-in user; sends users who must change their password to that page. */
function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="center muted">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}

function RequirePermission({ permission }: { permission: Permission }) {
  const { can } = useAuth();
  return can(permission) ? <Outlet /> : <Navigate to="/" replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route element={<RequirePermission permission="assets:read" />}>
                <Route path="/assets" element={<AssetsPage />} />
                <Route path="/assets/:id" element={<AssetDetailPage />} />
                <Route path="/locations" element={<LocationsPage />} />
                <Route path="/library" element={<LibraryPage />} />
              </Route>
              <Route element={<RequirePermission permission="assets:write" />}>
                <Route path="/assets/new" element={<AssetFormPage />} />
                <Route path="/assets/:id/edit" element={<AssetFormPage />} />
              </Route>
              <Route element={<RequirePermission permission="users:read" />}>
                <Route path="/users" element={<UsersPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
