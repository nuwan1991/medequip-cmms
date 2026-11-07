import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Site } from '@medequip/db';
import {
  siteCreateSchema,
  siteUpdateSchema,
  type SiteCreateInput,
  type SiteDto,
  type SiteUpdateInput,
} from '@medequip/shared';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { AuditService } from '../audit/audit.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { isUniqueViolation } from '../common/prisma-errors';
import { clientMeta, type AppRequest, type ClientMeta, type RequestUser } from '../common/request';
import { CurrentUser, RequirePermissions } from '../auth/decorators';

export function toSiteDto(site: Site): SiteDto {
  return {
    id: site.id,
    name: site.name,
    code: site.code,
    address: site.address,
    timezone: site.timezone,
  };
}

const duplicateCode = () =>
  new ConflictException({ code: 'SITE_CODE_EXISTS', message: 'A site with this code exists' });

@Injectable()
export class SitesService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(actor: RequestUser): Promise<SiteDto[]> {
    const sites = await this.db.run(actor.organizationId, (tx) =>
      tx.site.findMany({
        where: { organizationId: actor.organizationId, deletedAt: null },
        orderBy: { name: 'asc' },
      }),
    );
    return sites.map(toSiteDto);
  }

  async create(actor: RequestUser, input: SiteCreateInput, meta: ClientMeta): Promise<SiteDto> {
    const ctx = await this.entitlements.forOrganization(actor.organizationId);
    return this.db.run(actor.organizationId, async (tx) => {
      const count = await tx.site.count({
        where: { organizationId: actor.organizationId, deletedAt: null },
      });
      this.entitlements.assertWithinLimit(ctx, 'maxSites', count);
      try {
        const site = await tx.site.create({
          data: { ...input, organizationId: actor.organizationId },
        });
        await this.audit.log(
          {
            organizationId: actor.organizationId,
            userId: actor.userId,
            entity: 'Site',
            entityId: site.id,
            action: 'CREATE',
            after: toSiteDto(site),
            meta,
          },
          tx,
        );
        return toSiteDto(site);
      } catch (err) {
        if (isUniqueViolation(err)) throw duplicateCode();
        throw err;
      }
    });
  }

  async update(
    actor: RequestUser,
    id: string,
    input: SiteUpdateInput,
    meta: ClientMeta,
  ): Promise<SiteDto> {
    await this.entitlements.assertOrgWritable(actor.organizationId);
    return this.db.run(actor.organizationId, async (tx) => {
      const site = await tx.site.findFirst({
        where: { id, organizationId: actor.organizationId, deletedAt: null },
      });
      if (!site) throw new NotFoundException({ code: 'SITE_NOT_FOUND', message: 'Site not found' });
      try {
        const updated = await tx.site.update({
          where: { id },
          data: { ...input, version: { increment: 1 } },
        });
        await this.audit.log(
          {
            organizationId: actor.organizationId,
            userId: actor.userId,
            entity: 'Site',
            entityId: id,
            action: 'UPDATE',
            before: toSiteDto(site),
            after: toSiteDto(updated),
            meta,
          },
          tx,
        );
        return toSiteDto(updated);
      } catch (err) {
        if (isUniqueViolation(err)) throw duplicateCode();
        throw err;
      }
    });
  }
}

/** Sites = hospitals / campuses of the organization. Limited by plan (maxSites). */
@Controller('sites')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  @RequirePermissions('assets:read')
  list(@CurrentUser() actor: RequestUser): Promise<SiteDto[]> {
    return this.sites.list(actor);
  }

  @Post()
  @RequirePermissions('org:manage')
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(siteCreateSchema)) body: SiteCreateInput,
    @Req() req: AppRequest,
  ): Promise<SiteDto> {
    return this.sites.create(actor, body, clientMeta(req));
  }

  @Patch(':id')
  @RequirePermissions('org:manage')
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(siteUpdateSchema)) body: SiteUpdateInput,
    @Req() req: AppRequest,
  ): Promise<SiteDto> {
    return this.sites.update(actor, id, body, clientMeta(req));
  }
}

@Module({
  controllers: [SitesController],
  providers: [SitesService],
})
export class SitesModule {}
