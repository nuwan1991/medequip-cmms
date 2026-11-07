import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, type Prisma } from '@medequip/db';

export type TenantTx = Prisma.TransactionClient;

/**
 * Database access for tenant data, protected by PostgreSQL Row-Level Security.
 *
 * Connects as the restricted `medequip_app` role (APP_DATABASE_URL). Every call to `run()`
 * opens a transaction and sets `app.organization_id`, so the database itself only returns
 * and accepts rows of that organization - even if a query forgets a `where` filter.
 *
 * Feature modules (users, sites, assets, ...) must use this service, not PrismaService.
 */
@Injectable()
export class TenantPrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(TenantPrismaService.name);
  readonly rlsEnforced: boolean;

  constructor(config: ConfigService) {
    const appUrl = config.get<string>('APP_DATABASE_URL');
    super(appUrl ? { datasources: { db: { url: appUrl } } } : undefined);
    this.rlsEnforced = !!appUrl;
    if (!appUrl) {
      this.logger.warn(
        'APP_DATABASE_URL is not set: tenant queries use the owner role and Row-Level ' +
          'Security is NOT enforced by the database. Set it outside local experiments.',
      );
    }
  }

  /** Run `fn` in a transaction scoped to one organization. */
  run<T>(organizationId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return this.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
        return fn(tx);
      },
      { timeout: 15_000 },
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
