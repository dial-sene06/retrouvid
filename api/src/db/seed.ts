import { hash } from 'bcryptjs';
import { Client } from 'pg';
import { config } from '../config';

/** Données de démonstration entièrement fictives. */
async function seed() {
  const c = new Client({ connectionString: config.databaseUrl() });
  await c.connect();
  const mdp = await hash('Demo12345', 12);
  const comptes: [string, string, string, string, string][] = [
    ['Administrateur', 'Demo', 'admin@retrouvid.test', '770000001', 'admin'],
    ['Agent', 'Demo', 'agent@retrouvid.test', '770000002', 'agent'],
    ['Citoyen', 'Demo', 'citoyen@retrouvid.test', '770000003', 'citoyen'],
    ['Second', 'Citoyen', 'citoyen2@retrouvid.test', '770000004', 'citoyen'],
  ];
  for (const [nom, prenom, email, tel, role] of comptes) {
    await c.query(
      `INSERT INTO comptes (nom, prenom, email, telephone, mot_de_passe_hache, role) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (email) DO NOTHING`,
      [nom, prenom, email, tel, mdp, role]);
  }
  console.log('Comptes de démonstration (mot de passe Demo12345) : admin@, agent@, citoyen@, citoyen2@retrouvid.test');
  await c.end();
}
seed().catch((e) => { console.error(e); process.exit(1); });
