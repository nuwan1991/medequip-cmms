/**
 * Validates environment variables at startup so misconfiguration fails fast.
 * Used by ConfigModule.forRoot({ validate }).
 */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const secret = env.JWT_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be set and at least 32 characters (generate: openssl rand -base64 48)',
    );
  }
  if (env.NODE_ENV === 'production' && secret.startsWith('dev-only')) {
    throw new Error('JWT_SECRET is still the development placeholder - set a real secret');
  }
  if (env.NODE_ENV === 'production' && !env.APP_DATABASE_URL) {
    throw new Error(
      'APP_DATABASE_URL (restricted medequip_app role) is required in production so that ' +
        'Row-Level Security protects tenant data',
    );
  }
  return env;
}

export const REFRESH_COOKIE = 'medequip_rt';
