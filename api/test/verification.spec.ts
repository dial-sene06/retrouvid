process.env.VERIF_TELEPHONE = 'oui';
process.env.AUTH_LIMIT = '1000';

import { hash } from 'bcryptjs';
import { auth, Banc, demarrer } from './aide';

/** Vérification du téléphone par un code à 6 chiffres (SMS simulé) : avant l'inscription et à chaque connexion d'un citoyen. */
let b: Banc;
beforeAll(async () => { b = await demarrer(); });
afterAll(async () => { await b.fermer(); });
afterEach(() => { delete process.env.SMS_MODE; });

const fiche = (email: string) => ({ nom: 'Diop', prenom: 'Awa', email, telephone: '77 123 45 67', motDePasse: 'MotDePasse1', accepteCgu: true });
const nbComptes = async (email: string) => (await b.pool.query('SELECT count(*)::int n FROM comptes WHERE email = $1', [email])).rows[0].n;
const nbCodes = async () => (await b.pool.query('SELECT count(*)::int n FROM verifications_telephone')).rows[0].n;
const autreCode = (code: string) => (code === '000000' ? '111111' : '000000');
const saisir = (verificationId: string, code: string) => b.http().post('/auth/verification').send({ verificationId, code });

describe('inscription', () => {
  it("ne crée le compte qu'une fois le code saisi", async () => {
    const r = await b.http().post('/auth/inscription').send(fiche('awa@test.sn'));
    expect(r.status).toBe(201);
    expect(r.body.verificationRequise).toBe(true);
    expect(r.body.jeton).toBeUndefined();
    expect(r.body.codeSimule).toMatch(/^[0-9]{6}$/);
    expect(r.body.telephone).toBe('•• ••• •• 67');
    expect(await nbComptes('awa@test.sn')).toBe(0);

    expect((await saisir(r.body.verificationId, autreCode(r.body.codeSimule))).status).toBe(401);
    expect(await nbComptes('awa@test.sn')).toBe(0);

    const ok = await saisir(r.body.verificationId, r.body.codeSimule);
    expect(ok.status).toBe(201);
    expect(ok.body.compte.role).toBe('citoyen');
    expect((await b.http().get('/auth/moi').set(auth(ok.body.jeton))).status).toBe(200);
    const c = (await b.pool.query("SELECT telephone, cgu_acceptees_le FROM comptes WHERE email = 'awa@test.sn'")).rows[0];
    expect(c.telephone).toBe('77 123 45 67');
    expect(c.cgu_acceptees_le).not.toBeNull();
  });

  it("un code ne sert qu'une fois et ne garde aucune donnée après usage", async () => {
    const r = await b.http().post('/auth/inscription').send(fiche('une-fois@test.sn'));
    expect((await saisir(r.body.verificationId, r.body.codeSimule)).status).toBe(201);
    expect((await saisir(r.body.verificationId, r.body.codeSimule)).status).toBe(401);
    expect(await nbComptes('une-fois@test.sn')).toBe(1);
    const v = (await b.pool.query('SELECT code_hache, charge FROM verifications_telephone WHERE id = $1', [r.body.verificationId])).rows[0];
    expect(v.charge).toBeNull();
    expect(v.code_hache).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuse un e-mail déjà pris avant tout envoi de code, et les entrées invalides', async () => {
    const avant = await nbCodes();
    expect((await b.http().post('/auth/inscription').send(fiche('awa@test.sn'))).status).toBe(409);
    expect((await b.http().post('/auth/inscription').send({ ...fiche('x@test.sn'), telephone: 'abc' })).status).toBe(400);
    expect((await saisir('pas-un-uuid', '123456')).status).toBe(400);
    expect((await saisir('00000000-0000-4000-8000-000000000000', '12')).status).toBe(400);
    expect((await saisir('00000000-0000-4000-8000-000000000000', '123456')).status).toBe(401);
    expect(await nbCodes()).toBe(avant);
  });
});

describe('connexion', () => {
  beforeAll(async () => {
    const h = await hash('MotDePasse1', 4);
    await b.pool.query(`INSERT INTO comptes (nom, prenom, email, telephone, mot_de_passe_hache, role) VALUES
      ('Sow','Ali','ali@test.sn','770001122',$1,'citoyen'), ('Fall','Agent','agent@test.sn','770001133',$1,'agent'), ('Ba','Admin','admin@test.sn','770001144',$1,'admin')`, [h]);
  });

  it("les agents et l'administrateur se connectent sans code", async () => {
    const avant = await nbCodes();
    for (const [email, role] of [['agent@test.sn', 'agent'], ['admin@test.sn', 'admin']]) {
      const r = await b.http().post('/auth/connexion').send({ email, motDePasse: 'MotDePasse1' });
      expect(r.status).toBe(201);
      expect(r.body.verificationRequise).toBeUndefined();
      expect(r.body.compte.role).toBe(role);
      expect((await b.http().get('/auth/moi').set(auth(r.body.jeton))).status).toBe(200);
    }
    expect(await nbCodes()).toBe(avant);
  });
  const entrer = () => b.http().post('/auth/connexion').send({ email: 'ali@test.sn', motDePasse: 'MotDePasse1' });

  it('le mot de passe seul ne donne pas de jeton : il faut le code', async () => {
    const r = await entrer();
    expect(r.status).toBe(201);
    expect(r.body.verificationRequise).toBe(true);
    expect(r.body.jeton).toBeUndefined();
    expect(r.body.telephone).toBe('•• ••• •• 22');
    const ok = await saisir(r.body.verificationId, r.body.codeSimule);
    expect(ok.status).toBe(201);
    expect(ok.body.compte).toMatchObject({ email: 'ali@test.sn', role: 'citoyen' });
    expect((await b.http().get('/auth/moi').set(auth(ok.body.jeton))).status).toBe(200);
    expect((await b.pool.query("SELECT count(*)::int n FROM journal_actions WHERE action = 'connexion' AND compte_id = $1", [ok.body.compte.id])).rows[0].n).toBe(1);
  });

  it('un mauvais mot de passe ne déclenche aucun code', async () => {
    const avant = await nbCodes();
    const r = await b.http().post('/auth/connexion').send({ email: 'ali@test.sn', motDePasse: 'Mauvais1234' });
    expect(r.status).toBe(401);
    expect(r.body.verificationId).toBeUndefined();
    expect(await nbCodes()).toBe(avant);
  });

  it('cinq essais au plus : le bon code est ensuite refusé', async () => {
    const r = await entrer();
    for (let i = 0; i < 5; i++) expect((await saisir(r.body.verificationId, autreCode(r.body.codeSimule))).status).toBe(401);
    expect((await saisir(r.body.verificationId, r.body.codeSimule)).status).toBe(401);
  });

  it('un code expiré est refusé', async () => {
    const r = await entrer();
    await b.pool.query("UPDATE verifications_telephone SET expire_le = now() - interval '1 second' WHERE id = $1", [r.body.verificationId]);
    expect((await saisir(r.body.verificationId, r.body.codeSimule)).status).toBe(401);
  });

  it("un nouvel envoi remplace l'ancien code, trois envois au plus", async () => {
    const r = await entrer();
    const id = r.body.verificationId;
    const r2 = await b.http().post('/auth/verification/renvoyer').send({ verificationId: id });
    expect(r2.status).toBe(201);
    expect(r2.body.verificationId).toBe(id);
    // une chance sur un million que le nouveau code soit le même : on ne teste le refus de l'ancien que s'il diffère
    if (r2.body.codeSimule !== r.body.codeSimule) expect((await saisir(id, r.body.codeSimule)).status).toBe(401);
    const r3 = await b.http().post('/auth/verification/renvoyer').send({ verificationId: id });
    expect(r3.status).toBe(201);
    expect((await b.http().post('/auth/verification/renvoyer').send({ verificationId: id })).status).toBe(400);
    expect((await saisir(id, r3.body.codeSimule)).status).toBe(201);
  });

  it('un compte désactivé entre le mot de passe et le code ne se connecte pas', async () => {
    const r = await entrer();
    await b.pool.query("UPDATE comptes SET actif = false WHERE email = 'ali@test.sn'");
    expect((await saisir(r.body.verificationId, r.body.codeSimule)).status).toBe(401);
    await b.pool.query("UPDATE comptes SET actif = true WHERE email = 'ali@test.sn'");
  });

  it("hors simulation, le code n'est jamais renvoyé à l'écran", async () => {
    process.env.SMS_MODE = 'reel';
    const r = await entrer();
    expect(r.body.verificationRequise).toBe(true);
    expect(r.body.codeSimule).toBeUndefined();
  });
});
