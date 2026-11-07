import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@medequip/db';

/**
 * SYSTEM database client (owner role, DATABASE_URL). Row-Level Security does not apply.
 *
 * Only for trusted system work that runs before a tenant is known or across tenants:
 * authentication (login, sessions, guard), plan/entitlement lookups, health checks.
 * Tenant data in feature modules must go through TenantPrismaService.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
