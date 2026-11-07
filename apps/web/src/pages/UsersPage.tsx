import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  PASSWORD_MIN_LENGTH,
  ROLES,
  ROLE_LABELS,
  userCreateSchema,
  type Role,
  type UserDto,
} from '@medequip/shared';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';

export function UsersPage() {
  const { user: me, can } = useAuth();
  const canManage = can('users:manage');
  const [users, setUsers] = useState<UserDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers(await api<UserDto[]>('/users'));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const changeRole = (u: UserDto, role: Role) =>
    run(() => api(`/users/${u.id}`, { method: 'PATCH', body: { role } }));

  const toggleStatus = (u: UserDto) =>
    run(() =>
      api(`/users/${u.id}`, {
        method: 'PATCH',
        body: { status: u.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED' },
      }),
    );

  const resetPassword = (u: UserDto) => {
    const password = window.prompt(
      `Temporary password for ${u.name} (min ${PASSWORD_MIN_LENGTH} characters). ` +
        'They must change it at next sign-in.',
    );
    if (password) {
      void run(() => api(`/users/${u.id}/reset-password`, { method: 'POST', body: { password } }));
    }
  };

  const remove = (u: UserDto) => {
    if (window.confirm(`Remove ${u.name}? They will no longer be able to sign in.`)) {
      void run(() => api(`/users/${u.id}`, { method: 'DELETE' }));
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>Users</h1>
        {canManage && !showForm && <button onClick={() => setShowForm(true)}>Add user</button>}
      </div>

      {error && <p className="error">{error}</p>}

      {showForm && (
        <AddUserForm
          onCancel={() => setShowForm(false)}
          onCreated={async () => {
            setShowForm(false);
            await load();
          }}
        />
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last sign-in</th>
              {canManage && <th />}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === me?.id;
              return (
                <tr key={u.id} className={u.status === 'DISABLED' ? 'dim' : undefined}>
                  <td>
                    {u.name}
                    {isMe && <span className="badge"> (you)</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    {canManage && !isMe ? (
                      <select
                        value={u.role}
                        onChange={(e) => void changeRole(u, e.target.value as Role)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ROLE_LABELS[u.role]
                    )}
                  </td>
                  <td>
                    {u.status}
                    {u.mustChangePassword && u.status === 'ACTIVE' && (
                      <span className="badge"> · must change password</span>
                    )}
                  </td>
                  <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</td>
                  {canManage && (
                    <td className="actions">
                      {!isMe && (
                        <>
                          <button className="link" onClick={() => void toggleStatus(u)}>
                            {u.status === 'DISABLED' ? 'Enable' : 'Disable'}
                          </button>
                          <button className="link" onClick={() => resetPassword(u)}>
                            Reset password
                          </button>
                          <button className="link danger" onClick={() => remove(u)}>
                            Remove
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AddUserForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('TECHNICIAN');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = userCreateSchema.safeParse({ name, email, role, password });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Invalid input');
    setBusy(true);
    try {
      await api('/users', { method: 'POST', body: parsed.data });
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel form-grid" onSubmit={onSubmit}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Role
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Temporary password
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="off"
          required
        />
        <small className="muted">
          Share it securely. The user must change it at first sign-in.
        </small>
      </label>
      {error && <p className="error span-all">{error}</p>}
      <div className="span-all row">
        <button type="submit" disabled={busy}>
          {busy ? 'Adding…' : 'Add user'}
        </button>
        <button type="button" className="link" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
