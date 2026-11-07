// Jest setup: test-only defaults. Real values come from the environment / CI.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-only-secret-test-only-secret-0123456789';
