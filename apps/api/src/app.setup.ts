import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/** Shared app configuration for main.ts and end-to-end tests. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableShutdownHooks();

  // The web app is served from the same origin (Vite proxy / reverse proxy), so CORS is off
  // by default. Set CORS_ORIGINS (comma-separated) only when another origin must call the API.
  const origins = process.env.CORS_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins?.length) {
    app.enableCors({ origin: origins, credentials: true });
  }
}
