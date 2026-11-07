import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
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
import type { DeviceModel, Manufacturer } from '@medequip/db';
import {
  deviceModelCreateSchema,
  deviceModelUpdateSchema,
  manufacturerCreateSchema,
  type DeviceModelCreateInput,
  type DeviceModelDto,
  type DeviceModelUpdateInput,
  type ManufacturerCreateInput,
  type ManufacturerDto,
} from '@medequip/shared';
import { z } from 'zod';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { AuditService } from '../audit/audit.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { clientMeta, type AppRequest, type ClientMeta, type RequestUser } from '../common/request';
import { CurrentUser, RequirePermissions } from '../auth/decorators';

const modelQuerySchema = z.object({
  manufacturerId: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
});

function toManufacturerDto(m: Manufacturer): ManufacturerDto {
  return { id: m.id, name: m.name, website: m.website, isGlobal: m.organizationId === null };
}

function toModelDto(m: DeviceModel & { manufacturer: Manufacturer }): DeviceModelDto {
  return {
    id: m.id,
    manufacturer: { id: m.manufacturer.id, name: m.manufacturer.name },
    name: m.name,
    category: m.category,
    nomenclatureCode: m.nomenclatureCode,
    defaultRiskLevel: m.defaultRiskLevel,
    pmIntervalMonths: m.pmIntervalMonths,
    isGlobal: m.organizationId === null,
  };
}

/**
 * Device library. Reads return the shared global library plus the organization's own
 * entries (Row-Level Security decides visibility). Organizations can only change their own.
 */
@Injectable()
export class LibraryService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async manufacturers(actor: RequestUser): Promise<ManufacturerDto[]> {
    const rows = await this.db.run(actor.organizationId, (tx) =>
      tx.manufacturer.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
    );
    return rows.map(toManufacturerDto);
  }

  async createManufacturer(
    actor: RequestUser,
    input: ManufacturerCreateInput,
    meta: ClientMeta,
  ): Promise<ManufacturerDto> {
    await this.entitlements.assertOrgWritable(actor.organizationId);
    return this.db.run(actor.organizationId, async (tx) => {
      const duplicate = await tx.manufacturer.findFirst({
        where: { deletedAt: null, name: { equals: input.name, mode: 'insensitive' } },
      });
      if (duplicate) {
        throw new ConflictException({
          code: 'MANUFACTURER_EXISTS',
          message: `"${duplicate.name}" is already in the library`,
        });
      }
      const created = await tx.manufacturer.create({
        data: { ...input, organizationId: actor.organizationId },
      });
      await this.audit.log(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          entity: 'Manufacturer',
          entityId: created.id,
          action: 'CREATE',
          after: toManufacturerDto(created),
          meta,
        },
        tx,
      );
      return toManufacturerDto(created);
    });
  }

  async models(
    actor: RequestUser,
    query: z.infer<typeof modelQuerySchema>,
  ): Promise<DeviceModelDto[]> {
    const rows = await this.db.run(actor.organizationId, (tx) =>
      tx.deviceModel.findMany({
        where: {
          deletedAt: null,
          manufacturerId: query.manufacturerId,
          ...(query.q
            ? {
                OR: [
                  { name: { contains: query.q, mode: 'insensitive' } },
                  { category: { contains: query.q, mode: 'insensitive' } },
                  { manufacturer: { name: { contains: query.q, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        include: { manufacturer: true },
        orderBy: [{ manufacturer: { name: 'asc' } }, { name: 'asc' }],
        take: 1000,
      }),
    );
    return rows.map(toModelDto);
  }

  async createModel(
    actor: RequestUser,
    input: DeviceModelCreateInput,
    meta: ClientMeta,
  ): Promise<DeviceModelDto> {
    await this.entitlements.assertOrgWritable(actor.organizationId);
    return this.db.run(actor.organizationId, async (tx) => {
      const manufacturer = await tx.manufacturer.findFirst({
        where: { id: input.manufacturerId, deletedAt: null },
      });
      if (!manufacturer) {
        throw new BadRequestException({
          code: 'INVALID_MANUFACTURER',
          message: 'Manufacturer not found',
        });
      }
      const created = await tx.deviceModel.create({
        data: { ...input, organizationId: actor.organizationId },
        include: { manufacturer: true },
      });
      await this.audit.log(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          entity: 'DeviceModel',
          entityId: created.id,
          action: 'CREATE',
          after: toModelDto(created),
          meta,
        },
        tx,
      );
      return toModelDto(created);
    });
  }

  async updateModel(
    actor: RequestUser,
    id: string,
    input: DeviceModelUpdateInput,
    meta: ClientMeta,
  ): Promise<DeviceModelDto> {
    await this.entitlements.assertOrgWritable(actor.organizationId);
    return this.db.run(actor.organizationId, async (tx) => {
      const model = await tx.deviceModel.findFirst({
        where: { id, deletedAt: null },
        include: { manufacturer: true },
      });
      if (!model) {
        throw new NotFoundException({ code: 'MODEL_NOT_FOUND', message: 'Device model not found' });
      }
      if (model.organizationId === null) {
        throw new ForbiddenException({
          code: 'GLOBAL_LIBRARY_READ_ONLY',
          message: 'Shared library entries cannot be edited. Create your own model instead.',
        });
      }
      const updated = await tx.deviceModel.update({
        where: { id },
        data: { ...input, version: { increment: 1 } },
        include: { manufacturer: true },
      });
      await this.audit.log(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          entity: 'DeviceModel',
          entityId: id,
          action: 'UPDATE',
          before: toModelDto(model),
          after: toModelDto(updated),
          meta,
        },
        tx,
      );
      return toModelDto(updated);
    });
  }
}

@Controller('library')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get('manufacturers')
  @RequirePermissions('assets:read')
  manufacturers(@CurrentUser() actor: RequestUser): Promise<ManufacturerDto[]> {
    return this.library.manufacturers(actor);
  }

  @Post('manufacturers')
  @RequirePermissions('assets:write')
  createManufacturer(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(manufacturerCreateSchema)) body: ManufacturerCreateInput,
    @Req() req: AppRequest,
  ): Promise<ManufacturerDto> {
    return this.library.createManufacturer(actor, body, clientMeta(req));
  }

  @Get('models')
  @RequirePermissions('assets:read')
  models(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(modelQuerySchema)) query: z.infer<typeof modelQuerySchema>,
  ): Promise<DeviceModelDto[]> {
    return this.library.models(actor, query);
  }

  @Post('models')
  @RequirePermissions('assets:write')
  createModel(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(deviceModelCreateSchema)) body: DeviceModelCreateInput,
    @Req() req: AppRequest,
  ): Promise<DeviceModelDto> {
    return this.library.createModel(actor, body, clientMeta(req));
  }

  @Patch('models/:id')
  @RequirePermissions('assets:write')
  updateModel(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(deviceModelUpdateSchema)) body: DeviceModelUpdateInput,
    @Req() req: AppRequest,
  ): Promise<DeviceModelDto> {
    return this.library.updateModel(actor, id, body, clientMeta(req));
  }
}

@Module({
  controllers: [LibraryController],
  providers: [LibraryService],
})
export class LibraryModule {}
