import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './config';

/** Origines autorisées : en mode HTTPS forcé, seules les origines https (ou localhost) sont acceptées. */
export function origines(): string[] {
  const l = config.corsOrigin();
  if (config.forceHttps()) {
    const mauvaise = l.find((o) => !/^https:\/\//.test(o) && !/^http:\/\/localhost(:\d+)?$/.test(o));
    if (mauvaise) throw new Error(`CORS_ORIGIN doit utiliser https quand FORCE_HTTPS=true (reçu : ${mauvaise})`);
  }
  return l;
}

/** Redirige http vers https (308, la méthode est conservée). Le proxy TLS indique le protocole d'origine dans X-Forwarded-Proto. */
export function forcerHttps(req: Request, res: Response, next: NextFunction) {
  const proto = String(req.headers['x-forwarded-proto'] ?? (req.secure ? 'https' : 'http')).split(',')[0].trim();
  if (proto === 'https') return next();
  const hote = req.headers.host;
  if (!hote) return res.status(400).send('Hôte manquant');
  return res.redirect(308, `https://${hote}${req.originalUrl}`);
}

export function configurer(app: INestApplication) {
  if (config.forceHttps()) {
    (app as any).set('trust proxy', 1);
    app.use(forcerHttps);
  }
  app.use(helmet({ hsts: config.forceHttps() ? { maxAge: 31536000, includeSubDomains: true } : false }));
  // les photos arrivent en base64 (2 Mo maximum une fois décodées)
  (app as any).useBodyParser?.('json', { limit: '4mb' });
  app.enableCors({ origin: origines() });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  return app;
}

async function demarrer() {
  const app = configurer(await NestFactory.create(AppModule));
  await app.listen(config.port());
  console.log(`API RetrouvID sur http://localhost:${config.port()}`);
}
if (require.main === module) demarrer();
