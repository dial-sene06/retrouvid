// Vérification des exigences non fonctionnelles de sécurité (ENF), une par une.
process.env.AUTH_LIMIT = '1000';

import { JwtService } from '@nestjs/jwt';
import { auth, Banc, payer, compteInterne, decl, demarrer, inscrire, sig } from './aide';

let b: Banc;
beforeAll(async () => { b = await demarrer(); });
afterAll(async () => { await b.fermer(); });

describe('ENF sécurité', () => {
  it('mot de passe stocké haché avec bcrypt, coût 12, jamais en clair', async () => {
    await inscrire(b, 'bcrypt@test.sn');
    const r = await b.pool.query(`SELECT mot_de_passe_hache AS h FROM comptes WHERE email='bcrypt@test.sn'`);
    expect(r.rows[0].h).toMatch(/^\$2[aby]\$12\$/);
    expect(r.rows[0].h).not.toContain('MotDePasse1');
  });

  it('un jeton expiré ou signé avec une autre clé est refusé', async () => {
    const t = await inscrire(b, 'jeton@test.sn');
    const { sub } = b.app.get(JwtService).decode(t) as { sub: string };
    const expire = await b.app.get(JwtService).signAsync({ sub, role: 'citoyen' }, { expiresIn: '-10s' });
    expect((await b.http().get('/auth/moi').set(auth(expire))).status).toBe(401);
    const faux = await new JwtService({ secret: 'une-autre-cle-secrete-123456' }).signAsync({ sub, role: 'admin' });
    expect((await b.http().get('/auth/moi').set(auth(faux))).status).toBe(401);
    expect((await b.http().get('/auth/moi').set(auth(t))).status).toBe(200);
  });

  it('la durée de vie du jeton est de 8 heures', async () => {
    const t = await inscrire(b, 'duree@test.sn');
    const p = b.app.get(JwtService).decode(t) as { iat: number; exp: number };
    expect(p.exp - p.iat).toBe(8 * 3600);
  });

  it('l\'échec de connexion a le même message pour un e-mail inconnu et un mauvais mot de passe', async () => {
    await inscrire(b, 'meme@test.sn');
    const inconnu = await b.http().post('/auth/connexion').send({ email: 'personne@test.sn', motDePasse: 'MotDePasse1' });
    const mauvais = await b.http().post('/auth/connexion').send({ email: 'meme@test.sn', motDePasse: 'Mauvais1234' });
    expect(inconnu.status).toBe(401);
    expect(mauvais.status).toBe(401);
    expect(inconnu.body.message).toBe(mauvais.body.message);
  });

  it('chaque rôle est cantonné à ses routes', async () => {
    const citoyen = await inscrire(b, 'cloison@test.sn');
    const agent = await compteInterne(b, 'agent-enf@test.sn', 'agent');
    const admin = await compteInterne(b, 'admin-enf@test.sn', 'admin');
    expect((await b.http().get('/admin/stats').set(auth(citoyen))).status).toBe(403);
    expect((await b.http().get('/admin/stats').set(auth(agent))).status).toBe(403);
    expect((await b.http().get('/agent/correspondances').set(auth(citoyen))).status).toBe(403);
    expect((await b.http().post('/declarations').set(auth(admin)).send(decl)).status).toBe(403);
    expect((await b.http().post('/declarations').set(auth(agent)).send(decl)).status).toBe(403);
  });

  it('les coordonnées sont refusées tant que les trois conditions ne sont pas réunies', async () => {
    const agent = await compteInterne(b, 'agent-coord@test.sn', 'agent');
    const perdant = await inscrire(b, 'perdant@test.sn');
    const trouveur = await inscrire(b, 'trouveur@test.sn');
    await b.http().post('/declarations').set(auth(perdant)).send({ ...decl, numero: '4444444444444', nomProprietaire: 'Seydou Kane', dateNaissance: undefined });
    await b.http().post('/signalements').set(auth(trouveur)).send({ ...sig, numero: '4444444444444', nomSurDocument: 'KANE SEYDOU', dateNaissance: undefined });
    const c = (await b.pool.query(`SELECT id FROM correspondances ORDER BY cree_le DESC LIMIT 1`)).rows[0];
    const coord = () => b.http().get(`/correspondances/${c.id}/coordonnees`).set(auth(perdant));
    expect((await coord()).status).toBe(403); // rien validé
    await b.http().post(`/agent/correspondances/${c.id}/valider`).set(auth(agent));
    expect((await coord()).status).toBe(403); // agent seul
    await b.http().post(`/correspondances/${c.id}/valider`).set(auth(perdant));
    expect((await coord()).status).toBe(403); // agent + citoyen, pas de paiement
    expect((await b.http().get(`/correspondances/${c.id}/coordonnees`).set(auth(trouveur))).status).toBe(403); // le découvreur n'est pas de ce côté
    await payer(b, c.id, perdant);
    const ok = await coord();
    expect(ok.status).toBe(200);
    expect(ok.body.telephone).toBeDefined();
  });

  it('aucune donnée de moyen de paiement n\'est stockée', async () => {
    const cols = await b.pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='paiements'`);
    const noms = cols.rows.map((r) => r.column_name).sort();
    // seules des références de transaction sont gardées ; le numéro Wave ou Orange Money reste chez PayDunya
    expect(noms).toEqual(['compte_id', 'correspondance_id', 'cree_le', 'fournisseur', 'id', 'jeton', 'maj_le', 'montant', 'reference', 'statut', 'url_paiement']);
    expect(noms.filter((n) => /carte|card|telephone|numero|compte_mobile|pan|cvv/i.test(n))).toEqual([]);
  });

  it('un compte désactivé perd l\'accès immédiatement, même avec un jeton encore valide', async () => {
    const admin = await compteInterne(b, 'admin-desact@test.sn', 'admin');
    const t = await inscrire(b, 'desact@test.sn');
    const id = (await b.pool.query(`SELECT id FROM comptes WHERE email='desact@test.sn'`)).rows[0].id;
    expect((await b.http().patch(`/admin/comptes/${id}/actif`).set(auth(admin)).send({ actif: false })).status).toBe(200);
    expect((await b.http().get('/auth/moi').set(auth(t))).status).toBe(401);
  });

  it('la clôture efface numéro, nom, date de naissance et photo', async () => {
    const agent = await compteInterne(b, 'agent-clo@test.sn', 'agent');
    const admin = await compteInterne(b, 'admin-clo@test.sn', 'admin');
    const p = await inscrire(b, 'p-clo@test.sn');
    const f = await inscrire(b, 'f-clo@test.sn');
    const d = (await b.http().post('/declarations').set(auth(p)).send({ ...decl, numero: '3333333333333', nomProprietaire: 'Ndeye Gueye' })).body;
    const s = (await b.http().post('/signalements').set(auth(f)).send({ ...sig, numero: '3333333333333', nomSurDocument: 'GUEYE NDEYE' })).body;
    const c = (await b.pool.query(`SELECT id FROM correspondances WHERE declaration_id=$1 AND signalement_id=$2`, [d.id, s.id])).rows[0];
    await b.http().post(`/agent/correspondances/${c.id}/valider`).set(auth(agent));
    await b.http().post(`/correspondances/${c.id}/valider`).set(auth(p));
    await payer(b, c.id, p);
    await b.http().post(`/correspondances/${c.id}/confirmer-remise`).set(auth(p));
    await b.http().post(`/correspondances/${c.id}/confirmer-remise`).set(auth(f));
    expect((await b.http().post(`/admin/correspondances/${c.id}/cloturer`).set(auth(admin))).status).toBe(201);
    const dd = (await b.pool.query('SELECT numero, nom_proprietaire, date_naissance FROM declarations WHERE id=$1', [d.id])).rows[0];
    const ss = (await b.pool.query('SELECT numero, nom_sur_document FROM signalements WHERE id=$1', [s.id])).rows[0];
    expect(dd).toEqual({ numero: 'ANONYMISE', nom_proprietaire: 'ANONYMISE', date_naissance: null });
    expect(ss).toEqual({ numero: 'ANONYMISE', nom_sur_document: 'ANONYMISE' });
    expect((await b.pool.query('SELECT 1 FROM signalement_photos WHERE signalement_id=$1', [s.id])).rowCount).toBe(0);
  });

  it('les actions sensibles laissent une trace datée dans le journal', async () => {
    const r = await b.pool.query(`SELECT DISTINCT action FROM journal_actions`);
    const actions = r.rows.map((x) => x.action);
    for (const a of ['inscription', 'connexion', 'declaration_creee', 'signalement_cree', 'correspondance_validee_agent', 'correspondance_validee_citoyen',
      'paiement_reussi', 'consultation_coordonnees', 'remise_confirmee', 'cloture_anonymisation', 'compte_desactive']) expect(actions).toContain(a);
  });
});
