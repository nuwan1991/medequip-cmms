import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@medequip/db';
import {
  STATUSES_NOT_COUNTED,
  type AssetCreateInput,
  type AssetDetailDto,
  type AssetHistoryEntry,
  type AssetListQuery,
  type AssetListResponse,
  type AssetStatus,
  type AssetSummaryDto,
  type AssetUpdateInput,
} from '@medequip/shared';
import { TenantPrismaService, type TenantTx } from '../prisma/tenant-prisma.service';
import { AuditService } from '../audit/audit.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { dateOnly, isUniqueViolation } from '../common/prisma-errors';
import type { ClientMeta, RequestUser } from '../common/request';
import { locationAndDescendants, siteLocations } from '../locations/locations.module';
import { toCsv } from './csv';

const summaryInclude = {
  site: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  model: {
    select: { id: true, name: true, category: true, manufacturer: { select: { name: true } } },
  },
} satisfies Prisma.AssetInclude;

type AssetWithRefs = Prisma.AssetGetPayload<{ include: typeof summaryInclude }>;

const countsTowardLimit = (status: AssetStatus) => !STATUSES_NOT_COUNTED.includes(status);

function toSummary(a: AssetWithRefs): AssetSummaryDto {
  return {
    id: a.id,
    assetTag: a.assetTag,
    serialNumber: a.serialNumber,
    status: a.status,
    riskLevel: a.riskLevel,
    site: a.site,
    location: a.location,
    model: {
      id: a.model.id,
      name: a.model.name,
      category: a.model.category,
      manufacturer: a.model.manufacturer.name,
    },
    updatedAt: a.updatedAt.toISOString(),
  };
}

const tagTaken = () =>
  new ConflictException({
    code: 'ASSET_TAG_EXISTS',
    message: 'This asset tag is already used (possibly by a removed asset)',
  });

const notFound = () =>
  new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'Asset not found' });

@Injectable()
export class AssetsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(actor: RequestUser, query: AssetListQuery): Promise<AssetListResponse> {
    return this.db.run(actor.organizationId, async (tx) => {
      const where = await this.buildWhere(tx, actor, query);
      const [total, rows] = await Promise.all([
        tx.asset.count({ where }),
        tx.asset.findMany({
          where,
          include: summaryInclude,
          orderBy: { assetTag: 'asc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return { items: rows.map(toSummary), total, page: query.page, pageSize: query.pageSize };
    });
  }

  async get(actor: RequestUser, id: string): Promise<AssetDetailDto> {
    return this.db.run(actor.organizationId, (tx) => this.detail(tx, id));
  }

  async create(
    actor: RequestUser,
    input: AssetCreateInput,
    meta: ClientMeta,
  ): Promise<AssetDetailDto> {
    const ctx = await this.entitlements.forOrganization(actor.organizationId);
    return this.db.run(actor.organizationId, async (tx) => {
      if (countsTowardLimit(input.status)) {
        this.entitlements.assertWithinLimit(ctx, 'maxAssets', await this.countActive(tx, actor));
      } else {
        this.entitlements.assertWritable(ctx);
      }
      const { model } = await this.resolveRefs(tx, input.siteId, input.locationId, input.modelId);

      let id: string;
      try {
        const created = await tx.asset.create({
          data: {
            ...input,
            riskLevel: input.riskLevel ?? model.defaultRiskLevel,
            organizationId: actor.organizationId,
            originSiteId: input.siteId,
          },
        });
        id = created.id;
      } catch (err) {
        if (isUniqueViolation(err)) throw tagTaken();
        throw err;
      }

      const dto = await this.detail(tx, id);
      await this.audit.log(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          entity: 'Asset',
          entityId: id,
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
    input: AssetUpdateInput,
    meta: ClientMeta,
  ): Promise<AssetDetailDto> {
    const ctx = await this.entitlements.forOrganization(actor.organizationId);
    this.entitlements.assertWritable(ctx);

    return this.db.run(actor.organizationId, async (tx) => {
      const existing = await tx.asset.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw notFound();
      if (existing.version !== input.version) throw versionConflict();

      const { version, ...changes } = input;
      const siteId = changes.siteId ?? existing.siteId;
      // Moving to another site clears the old site's location unless a new one is given.
      const locationId =
        changes.locationId !== undefined
          ? changes.locationId
          : siteId !== existing.siteId
            ? null
            : existing.locationId;
      const modelId = changes.modelId ?? existing.modelId;
      if (
        siteId !== existing.siteId ||
        locationId !== existing.locationId ||
        modelId !== existing.modelId
      ) {
        await this.resolveRefs(tx, siteId, locationId ?? undefined, modelId);
      }

      // Bringing a disposed asset back counts toward the plan limit again.
      if (
        changes.status &&
        countsTowardLimit(changes.status) &&
        !countsTowardLimit(existing.status)
      ) {
        this.entitlements.assertWithinLimit(ctx, 'maxAssets', await this.countActive(tx, actor));
      }

      const before = await this.detail(tx, id);
      try {
        const result = await tx.asset.updateMany({
          where: { id, version },
          data: { ...changes, siteId, locationId, modelId, version: { increment: 1 } },
        });
        if (result.count !== 1) throw versionConflict();
      } catch (err) {
        if (isUniqueViolation(err)) throw tagTaken();
        throw err;
      }

      const after = await this.detail(tx, id);
      await this.audit.log(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          entity: 'Asset',
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

  /** Soft delete (record and history are kept). Prefer status DISPOSED for real disposals. */
  async remove(actor: RequestUser, id: string, meta: ClientMeta): Promise<void> {
    await this.entitlements.assertOrgWritable(actor.organizationId);
    await this.db.run(actor.organizationId, async (tx) => {
      const before = await this.detail(tx, id);
      await tx.asset.update({
        where: { id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await this.audit.log(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          entity: 'Asset',
          entityId: id,
          action: 'DELETE',
          before,
          meta,
        },
        tx,
      );
    });
  }

  /** Change history from the audit log. Always available, whatever the plan or status. */
  async history(actor: RequestUser, id: string): Promise<AssetHistoryEntry[]> {
    return this.db.run(actor.organizationId, async (tx) => {
      const exists = await tx.asset.count({ where: { id } });
      if (!exists) throw notFound();
      const logs = await tx.auditLog.findMany({
        where: { entity: 'Asset', entityId: id },
        orderBy: { at: 'desc' },
        take: 200,
      });
      const userIds = [...new Set(logs.map((l) => l.userId).filter((u): u is string => !!u))];
      const users = await tx.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      });
      const names = new Map(users.map((u) => [u.id, u.name]));
      return logs.map((l) => ({
        at: l.at.toISOString(),
        action: l.action,
        user: l.userId ? (names.get(l.userId) ?? null) : null,
        changes: l.action === 'UPDATE' ? diff(l.before, l.after) : {},
      }));
    });
  }

  /** CSV export. Data export is never blocked by plan or payment status. */
  async exportCsv(actor: RequestUser, query: AssetListQuery, meta: ClientMeta): Promise<string> {
    return this.db.run(actor.organizationId, async (tx) => {
      const where = await this.buildWhere(tx, actor, query);
      const rows = await tx.asset.findMany({
        where,
        include: {
          ...summaryInclude,
          model: {
            select: {
              id: true,
              name: true,
              category: true,
              nomenclatureCode: true,
              manufacturer: { select: { name: true } },
            },
          },
        },
        orderBy: { assetTag: 'asc' },
        take: 100_000,
      });
      const paths = new Map<string, string>();
      for (const siteId of new Set(rows.map((r) => r.siteId))) {
        for (const l of await siteLocations(tx, siteId)) paths.set(l.id, l.path);
      }
      await this.audit.log(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          entity: 'Asset',
          action: 'EXPORT',
          after: { rows: rows.length, filters: query },
          meta,
        },
        tx,
      );
      return toCsv(
        [
          'Asset tag',
          'Serial number',
          'UDI',
          'Manufacturer',
          'Model',
          'Category',
          'Nomenclature code',
          'Site',
          'Location',
          'Status',
          'Risk level',
          'Purchase date',
          'Purchase cost',
          'Warranty ends',
          'Commissioned',
          'Notes',
        ],
        rows.map((a) => [
          a.assetTag,
          a.serialNumber,
          a.udi,
          a.model.manufacturer.name,
          a.model.name,
          a.model.category,
          a.model.nomenclatureCode,
          a.site.name,
          a.locationId ? paths.get(a.locationId) : '',
          a.status,
          a.riskLevel,
          dateOnly(a.purchaseDate),
          a.purchaseCost?.toFixed(2),
          dateOnly(a.warrantyEndsAt),
          dateOnly(a.commissionedAt),
          a.notes,
        ]),
      );
    });
  }

  countActive(tx: TenantTx, actor: RequestUser): Promise<number> {
    return tx.asset.count({
      where: {
        organizationId: actor.organizationId,
        deletedAt: null,
        status: { notIn: [...STATUSES_NOT_COUNTED] },
      },
    });
  }

  private async buildWhere(
    tx: TenantTx,
    actor: RequestUser,
    query: AssetListQuery,
  ): Promise<Prisma.AssetWhereInput> {
    const q = query.q;
    return {
      organizationId: actor.organizationId,
      deletedAt: null,
      siteId: query.siteId,
      status: query.status,
      riskLevel: query.riskLevel,
      ...(query.locationId
        ? { locationId: { in: await locationAndDescendants(tx, query.locationId) } }
        : {}),
      ...(q
        ? {
            OR: [
              { assetTag: { contains: q, mode: 'insensitive' } },
              { serialNumber: { contains: q, mode: 'insensitive' } },
              { udi: { contains: q, mode: 'insensitive' } },
              { model: { name: { contains: q, mode: 'insensitive' } } },
              { model: { category: { contains: q, mode: 'insensitive' } } },
              { model: { manufacturer: { name: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
  }

  /**
   * Foreign keys are checked by PostgreSQL without Row-Level Security, so verify here that
   * referenced rows are visible to this organization (and consistent with each other).
   */
  private async resolveRefs(
    tx: TenantTx,
    siteId: string,
    locationId: string | undefined,
    modelId: string,
  ) {
    const site = await tx.site.findFirst({ where: { id: siteId, deletedAt: null } });
    if (!site) throw badRequest('INVALID_SITE', 'Site not found');
    if (locationId) {
      const location = await tx.location.findFirst({ where: { id: locationId, deletedAt: null } });
      if (!location) throw badRequest('INVALID_LOCATION', 'Location not found');
      if (location.siteId !== siteId) {
        throw badRequest('LOCATION_NOT_IN_SITE', 'Location belongs to another site');
      }
    }
    const model = await tx.deviceModel.findFirst({ where: { id: modelId, deletedAt: null } });
    if (!model) throw badRequest('INVALID_MODEL', 'Device model not found');
    return { site, model };
  }

  private async detail(tx: TenantTx, id: string): Promise<AssetDetailDto> {
    const a = await tx.asset.findFirst({
      where: { id, deletedAt: null },
      include: summaryInclude,
    });
    if (!a) throw notFound();
    const path = a.locationId
      ? (await siteLocations(tx, a.siteId)).find((l) => l.id === a.locationId)?.path
      : undefined;
    return {
      ...toSummary(a),
      udi: a.udi,
      location: a.location ? { ...a.location, path: path ?? a.location.name } : null,
      purchaseDate: dateOnly(a.purchaseDate),
      purchaseCost: a.purchaseCost?.toFixed(2) ?? null,
      warrantyEndsAt: dateOnly(a.warrantyEndsAt),
      commissionedAt: dateOnly(a.commissionedAt),
      notes: a.notes,
      version: a.version,
      createdAt: a.createdAt.toISOString(),
    };
  }
}

const IGNORED_IN_DIFF = new Set(['version', 'updatedAt']);

/** Field-level differences between two audit snapshots, with readable values. */
export function diff(before: unknown, after: unknown): AssetHistoryEntry['changes'] {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const readable = (v: unknown): unknown => {
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return o.path ?? o.name ?? JSON.stringify(v);
    }
    return v ?? null;
  };
  const changes: AssetHistoryEntry['changes'] = {};
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (IGNORED_IN_DIFF.has(key)) continue;
    if (JSON.stringify(b[key] ?? null) !== JSON.stringify(a[key] ?? null)) {
      changes[key] = { from: readable(b[key]), to: readable(a[key]) };
    }
  }
  return changes;
}

function versionConflict() {
  return new ConflictException({
    code: 'VERSION_CONFLICT',
    message: 'This asset was changed by someone else. Reload and try again.',
  });
}

function badRequest(code: string, message: string) {
  return new BadRequestException({ code, message });
}
