import { useEffect, useState } from 'react';
import { DEFAULT_PLANS } from '@medequip/shared';

type ApiState = 'checking' | 'online' | 'offline';

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

export function App() {
  const [api, setApi] = useState<ApiState>('checking');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? setApi('online') : setApi('offline')))
      .catch(() => setApi('offline'));
  }, []);

  return (
    <div className="layout">
      <header className="topbar">
        <strong>MedEquip</strong>
        <span className={`status status-${api}`}>API: {api}</span>
      </header>

      <main className="content">
        <h1>Medical Equipment Management</h1>
        <p className="muted">
          Starter shell. Modules below will be built one at a time - see docs/roadmap.md.
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
      </main>
    </div>
  );
}
