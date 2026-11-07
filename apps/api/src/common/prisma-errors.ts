import { Prisma } from '@medequip/db';

/** True when a write failed because of a unique constraint (e.g. duplicate asset tag). */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** Date-only columns as YYYY-MM-DD (or null). */
export function dateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
