// Re-export the generated Prisma client so apps import everything from '@medequip/db'.
export * from '@prisma/client';
export { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from './password';
