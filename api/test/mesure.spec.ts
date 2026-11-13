// Mesure de performance sur un volume important. Lancer avec : MESURE=1 npx jest test/mesure.spec.ts --runInBand
import { auth, Banc, compteInterne, decl, demarrer, inscrire } from './aide';

const mesure = process.env.MESURE ? describe : describe.skip;
const N = Number(process.env.VOLUME ?? 5000);

let b: Banc;
const med = (v: number[]) => [...v].sort((x, y) => x - y)[Math.floor(v.length / 2)];
const p95 = (v: number[]) => [...v].sort((x, y) => x - y)[Math.min(v.length - 1, Math.ceil(v.length * 0.95) - 1)];
const sortie: Record<string, unknown> = {};

async function chrono(n: number, f: () => Promise<unknown>) {
  const t: number[] = [];
  for (let i = 0; i < n; i++) { const d = process.hrtime.bigint(); await f(); t.push(Number(process.hrtime.bigint() - d) / 1e6); }
  return { n, mediane_ms: Math.round(med(t)), p95_ms: Math.round(p95(t)), max_ms: Math.round(Math.max(...t)) };
}

mesure('performance', () => {
  beforeAll(async () => { b = await demarrer(); }, 60000);
  afterAll(async () => { console.log('RESULTATS ' + JSON.stringify(sortie)); await b.fermer(); });

  it(`${N} déclarations, ${N} signalements et 300 comptes en base`, async () => {
    await b.pool.query(`INSERT INTO comptes (nom, prenom, email, telephone, mot_de_passe_hache, role)
      SELECT 'Nom'||g, 'Prenom'||g, 'u'||g||'@vol.sn', '77000'||lpad(g::text,4,'0'), 'x', 'citoyen' FROM generate_series(1,300) g`);
    await b.pool.query(`INSERT INTO declarations (compte_id, type_document, numero, nom_proprietaire, lieu_perte, date_perte)
      SELECT (SELECT id FROM comptes WHERE email='u'||(1+g%150)||'@vol.sn'), (ARRAY['cni','permis','passeport'])[1+g%3], 'D'||lpad(g::text,9,'0'), 'Nom Perdu '||g, 'Dakar', current_date - (g%60)
      FROM generate_series(1,${N}) g`);
    await b.pool.query(`INSERT INTO signalements (compte_id, type_document, numero, nom_sur_document, lieu_trouve, date_trouve)
      SELECT (SELECT id FROM comptes WHERE email='u'||(151+g%150)||'@vol.sn'), (ARRAY['cni','permis','passeport'])[1+g%3], 'S'||lpad(g::text,9,'0'), 'Nom Trouve '||g, 'Thiès', current_date - (g%60)
      FROM generate_series(1,${N}) g`);
    const n = await b.pool.query('SELECT (SELECT count(*) FROM declarations)::int d, (SELECT count(*) FROM signalements)::int s');
    sortie.volume = n.rows[0];
    expect(n.rows[0].d).toBe(N);
  }, 120000);

  it('mesure les opérations courantes', async () => {
    const citoyen = await inscrire(b, 'mesure@test.sn');
    const admin = await compteInterne(b, 'admin-mesure@test.sn', 'admin');
    let k = 0;
    sortie.connexion = await chrono(10, async () => { await b.http().post('/auth/connexion').send({ email: 'mesure@test.sn', motDePasse: 'MotDePasse1' }); });
    sortie.declaration_avec_rapprochement = await chrono(30, async () => {
      k++; await b.http().post('/declarations').set(auth(citoyen)).send({ ...decl, numero: 'Z' + String(k).padStart(9, '0'), nomProprietaire: 'Personne Unique ' + k, dateNaissance: undefined });
    });
    sortie.liste_declarations_citoyen = await chrono(30, async () => { await b.http().get('/declarations').set(auth(citoyen)); });
    sortie.recherche_admin = await chrono(30, async () => { await b.http().get('/admin/recherche?q=Nom Perdu 42').set(auth(admin)); });
    sortie.tableau_de_bord = await chrono(20, async () => { await b.http().get('/admin/tableau').set(auth(admin)); });
    const plan = await b.pool.query(`EXPLAIN (FORMAT JSON) SELECT * FROM signalements WHERE type_document='cni' AND numero='S000000003'`);
    sortie.requete_numero_utilise_index = JSON.stringify(plan.rows[0]['QUERY PLAN']).includes('Index');
    expect(true).toBe(true);
  }, 300000);
});
