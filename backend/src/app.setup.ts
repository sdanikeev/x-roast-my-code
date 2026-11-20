import { ValidationPipe } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

/**
 * Shared by main.ts and the e2e tests so tests run against the real configuration.
 * The app must be created with `{ bodyParser: false }`: only JSON bodies are accepted (see below).
 */
export function configureApp(app: NestExpressApplication, frontendUrl: string): void {
  // `req.ip` comes from X-Forwarded-For only if TRUST_PROXY is set. Enable it ONLY behind a proxy that
  // overwrites that header (nginx: proxy_set_header X-Forwarded-For $remote_addr). The Next.js rewrite
  // passes a client-supplied header through untouched, so trusting it would let anyone pick their own IP.
  const trust = process.env.TRUST_PROXY;
  if (trust) app.set('trust proxy', /^\d+$/.test(trust) ? Number(trust) : trust);

  // JSON only: a cross-site <form> can submit urlencoded/multipart bodies without a CORS preflight,
  // which would allow login CSRF. A JSON content type forces a preflight that CORS rejects.
  app.useBodyParser('json', { limit: '100kb' });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'POST' && req.path.startsWith('/auth/')) {
      const origin = req.headers.origin;
      if ((origin && origin !== frontendUrl) || req.headers['sec-fetch-site'] === 'cross-site') {
        new Logger('Origin').warn(
          `blocked ${req.method} ${req.path}: origin=${origin} sec-fetch-site=${req.headers['sec-fetch-site']} expected=${frontendUrl}`,
        );
        res.status(403).json({ statusCode: 403, message: 'forbidden origin' });
        return;
      }
    }
    next();
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.enableCors({ origin: frontendUrl, credentials: true });
}
