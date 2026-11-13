import { hash } from 'bcryptjs';
import { Client } from 'pg';
import { config } from '../config';

/**
 * Crée (ou réactive) un compte administrateur, par exemple sur la base de production.
 * Les valeurs viennent de l'environnement, jamais du code : ADMIN_EMAIL, ADMIN_MOT_DE_PASSE (12 caractères minimum),
 * ADMIN_NOM, ADMIN_PRENOM, ADMIN_TELEPHONE. Exemple : voir la section « Déploiement sur Vercel » du README.
 */
async function main() {
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const mdp = process.env.ADMIN_MOT_DE_PASSE ?? '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('ADMIN_EMAIL manquant ou invalide');
  if (mdp.length < 12 || mdp.length > 72) throw new Error('ADMIN_MOT_DE_PASSE doit compter de 12 à 72 caractères');
  const c = new Client({ connectionString: config.databaseUrl() });
  await c.connect();
  try {
    const r = await c.query(
      `INSERT INTO comptes (nom, prenom, email, telephone, mot_de_passe_hache, role)
       VALUES ($1, $2, $3, $4, $5, 'admin')
       ON CONFLICT (email) DO UPDATE SET role = 'admin', actif = true, mot_de_passe_hache = EXCLUDED.mot_de_passe_hache
       RETURNING id`,
      [process.env.ADMIN_NOM ?? 'Administrateur', process.env.ADMIN_PRENOM ?? 'RetrouvID', email, process.env.ADMIN_TELEPHONE ?? '770000000', await hash(mdp, 12)]);
    console.log(`Administrateur prêt : ${email} (${r.rows[0].id})`);
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
