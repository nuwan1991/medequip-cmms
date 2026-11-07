import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  passwordResetSchema,
  userCreateSchema,
  userUpdateSchema,
  type PasswordResetInput,
  type UserCreateInput,
  type UserDto,
  type UserUpdateInput,
} from '@medequip/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { clientMeta, type AppRequest, type RequestUser } from '../common/request';
import { CurrentUser, RequirePermissions } from '../auth/decorators';
import { UsersService } from './users.service';

/** User management within the caller's organization. */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users:read')
  list(@CurrentUser() actor: RequestUser): Promise<UserDto[]> {
    return this.users.list(actor);
  }

  @Post()
  @RequirePermissions('users:manage')
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(userCreateSchema)) body: UserCreateInput,
    @Req() req: AppRequest,
  ): Promise<UserDto> {
    return this.users.create(actor, body, clientMeta(req));
  }

  @Patch(':id')
  @RequirePermissions('users:manage')
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(userUpdateSchema)) body: UserUpdateInput,
    @Req() req: AppRequest,
  ): Promise<UserDto> {
    return this.users.update(actor, id, body, clientMeta(req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('users:manage')
  remove(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
  ): Promise<void> {
    return this.users.remove(actor, id, clientMeta(req));
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  @RequirePermissions('users:manage')
  resetPassword(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(passwordResetSchema)) body: PasswordResetInput,
    @Req() req: AppRequest,
  ): Promise<void> {
    return this.users.resetPassword(actor, id, body, clientMeta(req));
  }
}
