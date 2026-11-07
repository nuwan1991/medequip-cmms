import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '@medequip/shared';
import { useAuth } from '../auth/AuthContext';

export function Layout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar-left">
          <strong>MedEquip</strong>
          <span className="org">{user.organization.name}</span>
          <nav>
            <NavLink to="/" end>
              Home
            </NavLink>
            {can('users:read') && <NavLink to="/users">Users</NavLink>}
          </nav>
        </div>
        <div className="topbar-right">
          <span title={user.email}>
            {user.name} · {ROLE_LABELS[user.role]}
          </span>
          <button className="link" onClick={() => navigate('/change-password')}>
            Change password
          </button>
          <button
            className="link"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
