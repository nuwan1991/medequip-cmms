import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { EntitlementsModule } from './entitlements/entitlements.module';

@Module({
  imports: [PrismaModule, HealthModule, EntitlementsModule],
})
export class AppModule {}
