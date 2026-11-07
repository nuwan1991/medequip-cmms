import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PASSWORD_MIN_LENGTH, changePasswordSchema, type AuthUser } from '@medequip/shared';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';

export function ChangePasswordPage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const forced = !!user?.mustChangePassword;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) return setError('The new passwords do not match');
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Invalid password');

    setBusy(true);
    try {
      const updated = await api<AuthUser>('/auth/change-password', {
        method: 'POST',
        body: parsed.data,
      });
      setUser(updated);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Change password</h1>
        {forced && <p className="notice">You need to set a new password before you continue.</p>}
        <label>
          Current password
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
          <small className="muted">At least {PASSWORD_MIN_LENGTH} characters.</small>
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
        {forced ? (
          <button type="button" className="link" onClick={() => void logout()}>
            Sign out
          </button>
        ) : (
          <button type="button" className="link" onClick={() => navigate(-1)}>
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}
