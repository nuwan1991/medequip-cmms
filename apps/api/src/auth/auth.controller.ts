import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  changePasswordSchema,
  loginSchema,
  type AuthResponse,
  type AuthUser,
  type ChangePasswordInput,
  type LoginInput,
} from '@medequip/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { clientMeta, type AppRequest, type RequestUser } from '../common/request';
import { REFRESH_COOKIE } from '../config/env';
import { AuthService, type IssuedSession } from './auth.service';
import { AllowPendingPasswordChange, CurrentUser, Public } from './decorators';

/**
 * Token model:
 * - Access token (JWT, ~15 min) returned in the body; the web app keeps it in memory only
 *   and sends it as `Authorization: Bearer ...`.
 * - Refresh token in an httpOnly, SameSite=Strict cookie scoped to /api/auth, rotated on
 *   every refresh. JavaScript cannot read it, which limits damage from XSS.
 */
@Controller('auth')
export class AuthController {
  private readonly secureCookie: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.secureCookie = config.get('COOKIE_SECURE') === 'true';
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const issued = await this.auth.login(body, clientMeta(req));
    this.setRefreshCookie(res, issued);
    return issued.response;
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    try {
      const issued = await this.auth.refresh(readRefreshCookie(req), clientMeta(req));
      this.setRefreshCookie(res, issued);
      return issued.response;
    } catch (err) {
      // On a race another request already rotated the cookie - leave it alone.
      const code = (err as { response?: { code?: string } }).response?.code;
      if (code !== 'REFRESH_RACE') this.clearRefreshCookie(res);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(readRefreshCookie(req), clientMeta(req));
    this.clearRefreshCookie(res);
  }

  @AllowPendingPasswordChange()
  @Get('me')
  me(@CurrentUser() user: RequestUser): Promise<AuthUser> {
    return this.auth.me(user.userId);
  }

  @AllowPendingPasswordChange()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('change-password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @Req() req: AppRequest,
  ): Promise<AuthUser> {
    return this.auth.changePassword(user, body, clientMeta(req));
  }

  private setRefreshCookie(res: Response, issued: IssuedSession) {
    res.cookie(REFRESH_COOKIE, issued.refreshToken, {
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: 'strict',
      path: '/api/auth',
      expires: issued.refreshExpiresAt,
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: 'strict',
      path: '/api/auth',
    });
  }
}

function readRefreshCookie(req: AppRequest): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
