import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@medequip/db';

/**
 * Database client. Prisma connects lazily on the first query, so the API
 * can start (and report health) even when the database is not yet reachable.
 *
 * TODO(tenancy): add a per-request tenant context and PostgreSQL Row-Level
 * Security (SET app.organization_id) before any tenant data endpoints ship.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
