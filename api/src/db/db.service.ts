import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { config } from '../config';

@Injectable()
export class DbService implements OnModuleDestroy {
  // en serverless, chaque instance garde peu de connexions : la base (Neon) les mutualise de son côté
  readonly pool = new Pool({ connectionString: config.databaseUrl(), max: Number(process.env.PG_POOL_MAX ?? 10), idleTimeoutMillis: 10000 });

  async query<T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pool.query<T>(sql, params)).rows;
  }
  async one<T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.query<T>(sql, params))[0];
  }
  async tx<R>(fn: (c: PoolClient) => Promise<R>): Promise<R> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const r = await fn(c);
      await c.query('COMMIT');
      return r;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  onModuleDestroy() { return this.pool.end(); }
}

@Global()
@Module({ providers: [DbService], exports: [DbService] })
export class DbModule {}
