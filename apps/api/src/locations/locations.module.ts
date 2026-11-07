import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Location } from '@medequip/db';
import {
  locationCreateSchema,
  locationUpdateSchema,
  withLocationPaths,
  type LocationCreateInput,
  type LocationDto,
  type LocationUpdateInput,
} from '@medequip/shared';
import { z } from 'zod';
import { TenantPrismaService, type TenantTx } from '../prisma/tenant-prisma.service';
import { AuditService } from '../audit/audit.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { clientMeta, type AppRequest, type ClientMeta, type RequestUser } from '../common/request';
import { CurrentUser, RequirePermissions } from '../auth/decorators';

const listQuerySchema = z.object({ siteId: z.string().uuid().optional() });

function toDtos(rows: Location[]): LocationDto[] {
  return withLocationPaths(rows).map((l) => ({
    id: l.id,
    siteId: l.siteId,
    parentId: l.parentId,
    type: l.type,
    name: l.name,
    code: l.code,
    path: l.path,
    depth: l.depth,
  }));
}

/** All active locations of one site with their display paths. */
export async function siteLocations(tx: TenantTx, siteId: string): Promise<LocationDto[]> {
  return toDtos(await tx.location.findMany({ where: { siteId, deletedAt: null } }));
}

@Injectable()
export class LocationsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  list(actor: RequestUser, siteId?: string): Promise<LocationDto[]> {
    return this.db.run(actor.organizationId, async (tx) =>
      toDtos(
        await tx.location.findMany({
          where: { organizationId: actor.organizationId, deletedAt: null, siteId },
        }),
      ),
    );
  }

  async create(
    actor: RequestUser,
    input: LocationCreateInput,
    meta: ClientMeta,
  ): Promise<LocationDto> {
    await this.entitlements.assertOrgWritable(actor.organizationId);
    return this.db.run(actor.organizationId, async (tx) => {
      const site = await tx.site.findFirst({ where: { id: input.siteId, deletedAt: null } });
      if (!site) throw badRequest('INVALID_SITE', 'Site not found');
      if (input.parentId) await this.assertParent(tx, input.parentId, input.siteId);

      const created = await tx.location.create({
        data: { ...input, organizationId: actor.organizationId },
      });
      const dto = (await siteLocations(tx, input.siteId)).find((l) => l.id === created.id)!;
      await this.audit.log(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          entity: 'Location',
          entityId: created.id,
          action: 'CREATE',
          after: dto,
          meta,
        },
        tx,
      );
      return dto;
    });
  }

  async update(
    actor: RequestUser,
    id: string,
    input: LocationUpdateInput,
    meta: ClientMeta,
  ): Promise<LocationDto> {
    await this.entitlements.assertOrgWritable(actor.organizationId);
    return this.db.run(actor.organizationId, async (tx) => {
      const location = await this.find(tx, id);
      if (input.parentId) {
        await this.assertParent(tx, input.parentId, location.siteId);
        // Moving a location under itself or one of its children would create a loop.
        const all = await siteLocations(tx, location.siteId);
        const descendants = descendantIds(all, id);
        if (input.parentId === id || descendants.has(input.parentId)) {
          throw badRequest('INVALID_PARENT', 'A location cannot be moved inside itself');
        }
      }
      const before = (await siteLocations(tx, location.siteId)).find((l) => l.id === id);
      await tx.location.update({ where: { id }, data: { ...input, version: { increment: 1 } } });
      const after = (await siteLocations(tx, location.siteId)).find((l) => l.id === id)!;
      await this.audit.log(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          entity: 'Location',
          entityId: id,
          action: 'UPDATE',
          before,
          after,
          meta,
        },
        tx,
      );
      return after;
    });
  }

  /** Soft delete; only allowed when nothing (sub-locations or assets) is inside. */
  async remove(actor: RequestUser, id: string, meta: ClientMeta): Promise<void> {
    await this.entitlements.assertOrgWritable(actor.organizationId);
    await this.db.run(actor.organizationId, async (tx) => {
      const location = await this.find(tx, id);
      const [children, assets] = await Promise.all([
        tx.location.count({ where: { parentId: id, deletedAt: null } }),
        tx.asset.count({ where: { locationId: id, deletedAt: null } }),
      ]);
      if (children || assets) {
        throw new ConflictException({
          code: 'LOCATION_IN_USE',
          message: `Location still contains ${children} sub-location(s) and ${assets} asset(s). Move them first.`,
        });
      }
      await tx.location.update({
        where: { id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await this.audit.log(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          entity: 'Location',
          entityId: id,
          action: 'DELETE',
          before: { name: location.name, type: location.type, siteId: location.siteId },
          meta,
        },
        tx,
      );
    });
  }

  private async find(tx: TenantTx, id: string): Promise<Location> {
    const location = await tx.location.findFirst({ where: { id, deletedAt: null } });
    if (!location) {
      throw new NotFoundException({ code: 'LOCATION_NOT_FOUND', message: 'Location not found' });
    }
    return location;
  }

  private async assertParent(tx: TenantTx, parentId: string, siteId: string) {
    const parent = await tx.location.findFirst({ where: { id: parentId, deletedAt: null } });
    if (!parent || parent.siteId !== siteId) {
      throw badRequest('INVALID_PARENT', 'Parent location must exist in the same site');
    }
  }
}

function descendantIds(all: LocationDto[], id: string): Set<string> {
  const result = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    for (const l of all) {
      if (l.parentId === current && !result.has(l.id)) {
        result.add(l.id);
        stack.push(l.id);
      }
    }
  }
  return result;
}

/** Ids of a location and everything inside it (for "assets in this department" filters). */
export async function locationAndDescendants(tx: TenantTx, id: string): Promise<string[]> {
  const location = await tx.location.findFirst({ where: { id, deletedAt: null } });
  if (!location) return [id];
  const all = await siteLocations(tx, location.siteId);
  return [id, ...descendantIds(all, id)];
}

function badRequest(code: string, message: string) {
  return new BadRequestException({ code, message });
}

@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @RequirePermissions('assets:read')
  list(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(listQuerySchema)) query: z.infer<typeof listQuerySchema>,
  ): Promise<LocationDto[]> {
    return this.locations.list(actor, query.siteId);
  }

  @Post()
  @RequirePermissions('assets:write')
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(locationCreateSchema)) body: LocationCreateInput,
    @Req() req: AppRequest,
  ): Promise<LocationDto> {
    return this.locations.create(actor, body, clientMeta(req));
  }

  @Patch(':id')
  @RequirePermissions('assets:write')
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(locationUpdateSchema)) body: LocationUpdateInput,
    @Req() req: AppRequest,
  ): Promise<LocationDto> {
    return this.locations.update(actor, id, body, clientMeta(req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('assets:write')
  remove(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
  ): Promise<void> {
    return this.locations.remove(actor, id, clientMeta(req));
  }
}

@Module({
  controllers: [LocationsController],
  providers: [LocationsService],
})
export class LocationsModule {}
