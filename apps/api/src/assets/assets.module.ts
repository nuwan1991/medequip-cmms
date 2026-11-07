import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  assetCreateSchema,
  assetListQuerySchema,
  assetUpdateSchema,
  type AssetCreateInput,
  type AssetDetailDto,
  type AssetHistoryEntry,
  type AssetListQuery,
  type AssetListResponse,
  type AssetUpdateInput,
} from '@medequip/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { clientMeta, type AppRequest, type RequestUser } from '../common/request';
import { CurrentUser, RequirePermissions } from '../auth/decorators';
import { AssetsService } from './assets.service';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @RequirePermissions('assets:read')
  list(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(assetListQuerySchema)) query: AssetListQuery,
  ): Promise<AssetListResponse> {
    return this.assets.list(actor, query);
  }

  // Declared before ':id' so "export.csv" is not treated as an id.
  @Get('export.csv')
  @RequirePermissions('assets:read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="assets.csv"')
  export(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(assetListQuerySchema)) query: AssetListQuery,
    @Req() req: AppRequest,
  ): Promise<string> {
    return this.assets.exportCsv(actor, query, clientMeta(req));
  }

  @Get(':id')
  @RequirePermissions('assets:read')
  get(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AssetDetailDto> {
    return this.assets.get(actor, id);
  }

  @Get(':id/history')
  @RequirePermissions('assets:read')
  history(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AssetHistoryEntry[]> {
    return this.assets.history(actor, id);
  }

  @Post()
  @RequirePermissions('assets:write')
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(assetCreateSchema)) body: AssetCreateInput,
    @Req() req: AppRequest,
  ): Promise<AssetDetailDto> {
    return this.assets.create(actor, body, clientMeta(req));
  }

  @Patch(':id')
  @RequirePermissions('assets:write')
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assetUpdateSchema)) body: AssetUpdateInput,
    @Req() req: AppRequest,
  ): Promise<AssetDetailDto> {
    return this.assets.update(actor, id, body, clientMeta(req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('assets:write')
  remove(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
  ): Promise<void> {
    return this.assets.remove(actor, id, clientMeta(req));
  }
}

@Module({
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
