import { Injectable } from '@nestjs/common';
import type { AuditAction, Prisma } from '@medequip/db';
import { PrismaService } from '../prisma/prisma.service';
import type { ClientMeta } from '../common/request';

/** Fields that must never be written to the audit log. */
const SECRET_FIELDS = new Set(['passwordHash', 'tokenHash', 'previousTokenHash', 'password']);

export interface AuditEntry {
  organizationId: string | null;
  userId?: string | null;
  entity: string;
  entityId?: string | null;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
  meta?: ClientMeta;
}

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append an audit record. Pass the transaction client when the change happens inside a
   * transaction, so the audit record commits (or rolls back) together with the change.
   */
  async log(entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        organizationId: entry.organizationId,
        userId: entry.userId ?? null,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        action: entry.action,
        before: sanitize(entry.before),
        after: sanitize(entry.after),
        ipAddress: entry.meta?.ipAddress ?? null,
      },
    });
  }
}

export function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  const json = JSON.parse(JSON.stringify(value)) as unknown;
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => !SECRET_FIELDS.has(k))
          .map(([k, val]) => [k, strip(val)]),
      );
    }
    return v;
  };
  return strip(json) as Prisma.InputJsonValue;
}
