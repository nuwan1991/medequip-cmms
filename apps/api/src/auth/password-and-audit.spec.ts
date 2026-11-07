import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '@medequip/db';
import { sanitize } from '../audit/audit.service';
import { hashToken } from './auth.service';

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('Correct-Horse-42');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('Correct-Horse-42', hash)).toBe(true);
    expect(await verifyPassword('correct-horse-42', hash)).toBe(false);
  });

  it('salts each hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('never matches the dummy hash or malformed hashes', async () => {
    expect(await verifyPassword('anything', DUMMY_PASSWORD_HASH)).toBe(false);
    expect(await verifyPassword('anything', 'garbage')).toBe(false);
  });
});

describe('tokens and audit sanitizing', () => {
  it('hashes refresh tokens deterministically', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe('abc');
  });

  it('strips secrets from audit payloads, including nested ones', () => {
    const out = sanitize({ name: 'A', passwordHash: 'x', nested: { tokenHash: 'y', ok: 1 } });
    expect(out).toEqual({ name: 'A', nested: { ok: 1 } });
  });
});
