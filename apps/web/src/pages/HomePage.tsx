import { DEFAULT_PLANS } from '@medequip/shared';
import { useAuth } from '../auth/AuthContext';

const MODULES = [
  'Asset Register',
  'Work Orders',
  'Preventive Maintenance',
  'Calibration & Safety',
  'Spare Parts',
  'Contracts & Vendors',
  'Recalls & Alerts',
  'Reports & KPIs',
];

export function HomePage() {
  const { user } = useAuth();

  return (
    <>
      <h1>Welcome, {user?.name}</h1>
      <p className="muted">
        Medical equipment management for {user?.organization.name}. Modules below are being built
        one at a time.
      </p>

      <section>
        <h2>Modules</h2>
        <div className="grid">
          {MODULES.map((m) => (
            <div key={m} className="card">
              {m}
              <span className="badge">planned</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Plans</h2>
        <table>
          <thead>
            <tr>
              <th>Plan</th>
              <th>Assets</th>
              <th>Sites</th>
              <th>Users</th>
            </tr>
          </thead>
          <tbody>
            {DEFAULT_PLANS.map((p) => (
              <tr key={p.code}>
                <td>{p.name}</td>
                <td>{p.entitlements.limits.maxAssets ?? 'Unlimited'}</td>
                <td>{p.entitlements.limits.maxSites ?? 'Unlimited'}</td>
                <td>{p.entitlements.limits.maxUsers ?? 'Unlimited'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
