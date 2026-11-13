import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurer } from './main';

/**
 * Point d'entrée serverless (Vercel) : l'application Nest est créée une fois par instance, puis réutilisée
 * d'une requête à l'autre. La fonction web/api/index.js lui passe chaque requête adressée à /api.
 */
let serveur: Promise<(req: any, res: any) => void> | undefined;

export function serveurNest() {
  serveur ??= (async () => {
    const app = configurer(await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] }));
    await app.init();
    return app.getHttpAdapter().getInstance();
  })();
  return serveur;
}
