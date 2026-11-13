import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import { config } from '../config';

export async function migrate(url = config.databaseUrl()) {
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (nom text PRIMARY KEY, applique_le timestamptz NOT NULL DEFAULT now())');
  // src/db (ts-node) ou dist/src/db (code compilé, utilisé au build sur Vercel) : on remonte jusqu'au dossier migrations
  const dir = [join(__dirname, '..', '..', 'migrations'), join(__dirname, '..', '..', '..', 'migrations')].find((d) => existsSync(d))!;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    const done = await c.query('SELECT 1 FROM schema_migrations WHERE nom = $1', [f]);
    if (done.rowCount) continue;
    await c.query('BEGIN');
    try {
      await c.query(readFileSync(join(dir, f), 'utf8'));
      await c.query('INSERT INTO schema_migrations (nom) VALUES ($1)', [f]);
      await c.query('COMMIT');
      console.log('migration appliquée :', f);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }
  }
  await c.end();
}

if (require.main === module) {
  migrate().catch((e) => { console.error(e); process.exit(1); });
}
