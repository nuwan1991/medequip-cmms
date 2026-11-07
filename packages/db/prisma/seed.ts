/**
 * Seed data for local development: plan catalogue + one demo hospital.
 * Run: pnpm db:seed
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { DEFAULT_PLANS } from '@medequip/shared';

const prisma = new PrismaClient();

async function main() {
  for (const plan of DEFAULT_PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        priceMonthlyUsdCents: plan.priceMonthlyUsdCents,
        entitlements: plan.entitlements as unknown as Prisma.InputJsonValue,
      },
      create: {
        code: plan.code,
        name: plan.name,
        priceMonthlyUsdCents: plan.priceMonthlyUsdCents,
        entitlements: plan.entitlements as unknown as Prisma.InputJsonValue,
      },
    });
  }

  const freePlan = await prisma.plan.findUniqueOrThrow({ where: { code: 'FREE' } });

  const org = await prisma.organization.upsert({
    where: { slug: 'demo-hospital' },
    update: {},
    create: { name: 'Demo Hospital', slug: 'demo-hospital', planId: freePlan.id, status: 'ACTIVE' },
  });

  const site = await prisma.site.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'MAIN' } },
    update: {},
    create: { organizationId: org.id, name: 'Main Campus', code: 'MAIN' },
  });

  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'admin@demo.local' } },
    update: {},
    create: {
      organizationId: org.id,
      email: 'admin@demo.local',
      name: 'Demo Admin',
      role: 'ORG_ADMIN',
      status: 'ACTIVE',
    },
  });

  const existingAsset = await prisma.asset.findUnique({
    where: { organizationId_assetTag: { organizationId: org.id, assetTag: 'BME-0001' } },
  });
  if (!existingAsset) {
    const icu = await prisma.location.create({
      data: { organizationId: org.id, siteId: site.id, type: 'DEPARTMENT', name: 'ICU' },
    });
    const manufacturer = await prisma.manufacturer.create({
      data: { name: 'Example Medical Inc.' },
    });
    const model = await prisma.deviceModel.create({
      data: {
        manufacturerId: manufacturer.id,
        name: 'InfuPro 300',
        category: 'Infusion pump',
        defaultRiskLevel: 'HIGH',
        pmIntervalMonths: 12,
      },
    });
    await prisma.asset.create({
      data: {
        organizationId: org.id,
        siteId: site.id,
        locationId: icu.id,
        modelId: model.id,
        assetTag: 'BME-0001',
        serialNumber: 'SN-123456',
        riskLevel: 'HIGH',
        originSiteId: site.id,
      },
    });
  }

  console.log('Seed complete: plans + Demo Hospital');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
