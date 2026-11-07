import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { STATUSES_NOT_COUNTED, type UsageDto } from '@medequip/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { CurrentUser, RequirePermissions } from '../auth/decorators';
import type { RequestUser } from '../common/request';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly system: PrismaService,
    private readonly db: TenantPrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async usage(actor: RequestUser): Promise<UsageDto> {
    const orgId = actor.organizationId;
    const [org, ctx] = await Promise.all([
      this.system.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: { plan: { select: { code: true, name: true } } },
      }),
      this.entitlements.forOrganization(orgId),
    ]);
    const [assets, users, sites] = await this.db.run(orgId, (tx) =>
      Promise.all([
        tx.asset.count({
          where: {
            organizationId: orgId,
            deletedAt: null,
            status: { notIn: [...STATUSES_NOT_COUNTED] },
          },
        }),
        tx.user.count({
          where: { organizationId: orgId, deletedAt: null, status: { not: 'DISABLED' } },
        }),
        tx.site.count({ where: { organizationId: orgId, deletedAt: null } }),
      ]),
    );
    const { limits } = ctx.entitlements;
    return {
      plan: org.plan,
      assets: { used: assets, limit: limits.maxAssets },
      users: { used: users, limit: limits.maxUsers },
      sites: { used: sites, limit: limits.maxSites },
    };
  }
}

@Controller('organization')
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  /** Plan usage ("12 of 300 assets"). Every role can see it. */
  @Get('usage')
  @RequirePermissions('assets:read')
  usage(@CurrentUser() actor: RequestUser): Promise<UsageDto> {
    return this.organization.usage(actor);
  }
}

@Module({
  controllers: [OrganizationController],
  providers: [OrganizationService],
})
export class OrganizationModule {}
