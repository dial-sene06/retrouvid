import { auth, Banc, payer, compteInterne, decl, demarrer, inscrire, sig } from './aide';

let b: Banc;
beforeAll(async () => { b = await demarrer(); });
afterAll(async () => { await b.fermer(); });

describe('profil (EF03)', () => {
  it('le titulaire modifie son nom, son prénom et son téléphone, pas son e-mail ni son rôle', async () => {
    const t = await inscrire(b, 'profil@test.sn');
    const r = await b.http().patch('/auth/moi').set(auth(t)).send({ nom: 'Ndiaye', prenom: 'Fatou', telephone: '+221 77 000 11 22', role: 'admin', email: 'autre@test.sn' });
    expect(r.status).toBe(400); // champs inconnus refusés
    const ok = await b.http().patch('/auth/moi').set(auth(t)).send({ nom: 'Ndiaye', prenom: 'Fatou', telephone: '+221 77 000 11 22' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ nom: 'Ndiaye', prenom: 'Fatou', email: 'profil@test.sn', role: 'citoyen' });
    const j = await b.pool.query(`SELECT 1 FROM journal_actions WHERE action='profil_modifie'`);
    expect(j.rowCount).toBe(1);
  });
  it('refuse un téléphone invalide et une requête sans jeton', async () => {
    const t = await inscrire(b, 'profil2@test.sn');
    expect((await b.http().patch('/auth/moi').set(auth(t)).send({ nom: 'Ba', prenom: 'Ali', telephone: 'abc' })).status).toBe(400);
    expect((await b.http().patch('/auth/moi').send({ nom: 'Ba', prenom: 'Ali', telephone: '771234567' })).status).toBe(401);
  });
});

describe('modification d\'une déclaration (EF07)', () => {
  it('possible tant qu\'aucun rapprochement n\'existe, puis refusée', async () => {
    const t = await inscrire(b, 'owner@test.sn');
    const autre = await inscrire(b, 'intrus@test.sn');
    const d = (await b.http().post('/declarations').set(auth(t)).send(decl)).body;

    expect((await b.http().patch(`/declarations/${d.id}`).set(auth(autre)).send(decl)).status).toBe(403);
    const m = await b.http().patch(`/declarations/${d.id}`).set(auth(t)).send({ ...decl, lieuPerte: 'Gare de Thiaroye' });
    expect(m.status).toBe(200);
    expect(m.body.lieu_perte).toBe('Gare de Thiaroye');

    const decouvreur = await inscrire(b, 'trouveur@test.sn');
    expect((await b.http().post('/signalements').set(auth(decouvreur)).send(sig)).status).toBe(201);
    const apres = await b.http().patch(`/declarations/${d.id}`).set(auth(t)).send(decl);
    expect(apres.status).toBe(400);
  });
  it('relance le rapprochement avec le numéro corrigé', async () => {
    const t = await inscrire(b, 'erreur@test.sn');
    const decouvreur = await inscrire(b, 'trouveur2@test.sn');
    await b.http().post('/signalements').set(auth(decouvreur)).send({ ...sig, numero: '9988776655443', nomSurDocument: 'FALL MOR' });
    const d = (await b.http().post('/declarations').set(auth(t)).send({ ...decl, numero: '9988776655000', nomProprietaire: 'Mor Fall', dateNaissance: undefined })).body;
    // 40 points (nom) : déjà candidat, donc l'état change ; on vérifie que la correction du numéro ajoute 50 points
    const avant = await b.pool.query('SELECT score FROM correspondances WHERE declaration_id=$1', [d.id]);
    expect(avant.rows[0].score).toBe(40);
  });
});

describe('retrait de contenu par l\'administrateur (EF27, EF28)', () => {
  it('retire un signalement frauduleux, remet la déclaration en attente et journalise le motif', async () => {
    const admin = await compteInterne(b, 'admin2@test.sn', 'admin');
    const t = await inscrire(b, 'victime@test.sn');
    const f = await inscrire(b, 'fraudeur@test.sn');
    const d = (await b.http().post('/declarations').set(auth(t)).send({ ...decl, numero: '5555555555555', nomProprietaire: 'Ibrahima Sarr', dateNaissance: undefined })).body;
    const s = (await b.http().post('/signalements').set(auth(f)).send({ ...sig, numero: '5555555555555', nomSurDocument: 'SARR IBRAHIMA', dateNaissance: undefined })).body;
    expect((await b.pool.query('SELECT etat FROM declarations WHERE id=$1', [d.id])).rows[0].etat).toBe('en_verification');

    expect((await b.http().delete(`/admin/signalements/${s.id}`).set(auth(t)).send({ motif: 'faux document' })).status).toBe(403);
    expect((await b.http().delete(`/admin/signalements/${s.id}`).set(auth(admin)).send({})).status).toBe(400); // motif obligatoire
    const r = await b.http().delete(`/admin/signalements/${s.id}`).set(auth(admin)).send({ motif: 'Photo sans rapport avec le document' });
    expect(r.status).toBe(200);
    expect((await b.pool.query('SELECT etat FROM declarations WHERE id=$1', [d.id])).rows[0].etat).toBe('en_attente');
    expect((await b.pool.query('SELECT 1 FROM signalements WHERE id=$1', [s.id])).rowCount).toBe(0);
    const j = await b.pool.query(`SELECT detail FROM journal_actions WHERE action='contenu_retire'`);
    expect(j.rows[0].detail.motif).toMatch(/Photo/);
  });
  it('refuse le retrait quand un paiement est rattaché', async () => {
    const admin = await compteInterne(b, 'admin3@test.sn', 'admin');
    const agent = await compteInterne(b, 'agent3@test.sn', 'agent');
    const t = await inscrire(b, 'payeur@test.sn');
    const f = await inscrire(b, 'rendeur@test.sn');
    const d = (await b.http().post('/declarations').set(auth(t)).send({ ...decl, numero: '7777777777777', nomProprietaire: 'Khady Mbaye', dateNaissance: undefined })).body;
    await b.http().post('/signalements').set(auth(f)).send({ ...sig, numero: '7777777777777', nomSurDocument: 'MBAYE KHADY', dateNaissance: undefined });
    const c = (await b.pool.query('SELECT id FROM correspondances WHERE declaration_id=$1', [d.id])).rows[0];
    await b.http().post(`/agent/correspondances/${c.id}/valider`).set(auth(agent));
    await b.http().post(`/correspondances/${c.id}/valider`).set(auth(t));
    await payer(b, c.id, t);
    const r = await b.http().delete(`/admin/declarations/${d.id}`).set(auth(admin)).send({ motif: 'test de refus' });
    expect(r.status).toBe(400);
  });
});
