import { hash } from 'bcryptjs';
import { Client } from 'pg';
import { config } from '../config';

/**
 * Données de démonstration entièrement fictives, étalées sur 14 jours, pour alimenter le tableau de bord.
 * Noms, numéros et lieux sont inventés. À ne jamais lancer sur une base contenant de vraies données.
 */
const PRENOMS = ['Awa', 'Moussa', 'Fatou', 'Ibrahima', 'Khady', 'Seydou', 'Aminata', 'Cheikh', 'Rokhaya', 'Ousmane', 'Mariama', 'Pape'];
const NOMS = ['Diop', 'Ndiaye', 'Fall', 'Sow', 'Ba', 'Gueye', 'Faye', 'Sarr', 'Diallo', 'Mbaye', 'Thiam', 'Cissé'];
const LIEUX = ['Marché Sandaga', 'Gare routière des Pompiers', 'Plateau', 'Almadies', 'Parcelles Assainies', 'Université Cheikh Anta Diop', 'Rufisque', 'Pikine', 'Guédiawaye', 'Thiaroye'];
const TYPES = ['cni', 'cni', 'cni', 'permis', 'passeport'];
const ETATS_CORR = ['en_verification', 'en_verification', 'validee_agent', 'validee_citoyen', 'payee', 'remise', 'remise', 'cloturee', 'ecartee'];

const pick = <T,>(l: T[], i: number) => l[i % l.length];

async function main() {
  const c = new Client({ connectionString: config.databaseUrl() });
  await c.connect();
  const deja = await c.query("SELECT 1 FROM declarations d JOIN comptes u ON u.id = d.compte_id WHERE u.email LIKE 'demo%@retrouvid.test' LIMIT 1");
  if (deja.rowCount) { console.log('Données de démonstration déjà présentes, rien à faire.'); await c.end(); return; }
  const mdp = await hash('Demo12345', 12);
  const ids: string[] = [];
  for (let i = 0; i < 14; i++) {
    const nom = pick(NOMS, i + 3), prenom = pick(PRENOMS, i);
    const r = await c.query(
      `INSERT INTO comptes (nom, prenom, email, telephone, mot_de_passe_hache, role, cree_le)
       VALUES ($1,$2,$3,$4,$5,'citoyen', now() - ($6 || ' days')::interval) ON CONFLICT (email) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
      [nom, prenom, `demo${i}@retrouvid.test`, `7700010${String(i).padStart(2, '0')}`, mdp, String(13 - i)]);
    ids.push(r.rows[0].id);
  }
  let corr = 0;
  for (let i = 0; i < 36; i++) {
    const type = pick(TYPES, i), jours = 13 - Math.floor((i * 14) / 36), nom = `${pick(PRENOMS, i + 5)} ${pick(NOMS, i + 1)}`;
    const numero = `DEMO${type.toUpperCase()}${String(100000 + i * 37)}`;
    const proprio = ids[i % ids.length], trouveur = ids[(i + 5) % ids.length];
    const d = await c.query(
      `INSERT INTO declarations (compte_id, type_document, numero, nom_proprietaire, lieu_perte, date_perte, etat, cree_le)
       VALUES ($1,$2,$3,$4,$5,current_date - $6::int,'en_attente', now() - ($6 || ' days')::interval - interval '2 hours') RETURNING id`,
      [proprio, type, numero, nom, pick(LIEUX, i), jours]);
    // environ deux tiers des pertes ont un document trouvé
    if (i % 3 === 2) continue;
    const s = await c.query(
      `INSERT INTO signalements (compte_id, type_document, numero, nom_sur_document, lieu_trouve, date_trouve, etat, cree_le)
       VALUES ($1,$2,$3,$4,$5,current_date - $6::int,'en_attente', now() - ($6 || ' days')::interval) RETURNING id`,
      [trouveur, type, numero, nom, pick(LIEUX, i + 4), jours]);
    const etat = pick(ETATS_CORR, i);
    const k = await c.query(
      `INSERT INTO correspondances (declaration_id, signalement_id, score, champs_concordants, etat, cree_le)
       VALUES ($1,$2,$3,$4,$5, now() - ($6 || ' days')::interval + interval '1 hour') RETURNING id`,
      [d.rows[0].id, s.rows[0].id, 90, ['numero', 'nom'], etat, String(jours)]);
    corr++;
    const dossier = etat === 'ecartee' ? 'en_attente' : etat === 'remise' ? 'remis' : etat === 'cloturee' ? 'cloture' : 'en_verification';
    await c.query('UPDATE declarations SET etat=$2 WHERE id=$1', [d.rows[0].id, dossier]);
    await c.query('UPDATE signalements SET etat=$2 WHERE id=$1', [s.rows[0].id, dossier]);
    if (['payee', 'remise', 'cloturee'].includes(etat)) {
      await c.query(`INSERT INTO paiements (correspondance_id, compte_id, montant, statut, reference) VALUES ($1,$2,$3,'reussi',$4)`,
        [k.rows[0].id, proprio, config.montantCoordonnees, `DEMO-${i}`]);
      await c.query(`UPDATE paiements SET fournisseur='simulation' WHERE correspondance_id=$1`, [k.rows[0].id]);
      await c.query('INSERT INTO remises (correspondance_id) VALUES ($1) ON CONFLICT DO NOTHING', [k.rows[0].id]);
      await c.query(`INSERT INTO journal_actions (compte_id, action, objet_type, objet_id, cree_le) VALUES ($1,'paiement_reussi','correspondance',$2, now() - ($3 || ' days')::interval)`,
        [proprio, k.rows[0].id, String(jours)]);
    }
    await c.query(`INSERT INTO journal_actions (compte_id, action, objet_type, objet_id, cree_le) VALUES ($1,'declaration_creee','declaration',$2, now() - ($3 || ' days')::interval)`,
      [proprio, d.rows[0].id, String(jours)]);
  }
  console.log(`Données fictives ajoutées : 14 comptes, 36 déclarations, ${corr} correspondances (mot de passe Demo12345).`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
