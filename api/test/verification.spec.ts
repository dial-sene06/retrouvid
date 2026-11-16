process.env.VERIF_TELEPHONE = 'oui';
process.env.AUTH_LIMIT = '1000';

import { hash } from 'bcryptjs';
import { auth, Banc, demarrer } from './aide';
import { EmailService } from '../src/auth/email.service';

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

describe('code par e-mail (Brevo)', () => {
  /** Faux Brevo : garde les e-mails envoyés, peut simuler une panne. */
  const envoyes: any[] = [];
  let panne = false;
  const fauxBrevo = async (url: any, init: any): Promise<Response> => {
    if (panne) throw new Error('réseau coupé');
    envoyes.push({ url: String(url), entetes: init.headers, corps: JSON.parse(init.body) });
    return new Response(JSON.stringify({ messageId: 'test' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  };
  const codeDe = (e: any) => /code RetrouvID : ([0-9]{6})/.exec(e.corps.subject)![1];
  beforeAll(() => { b.app.get(EmailService).fetchImpl = fauxBrevo as typeof fetch; });
  beforeEach(() => { envoyes.length = 0; panne = false; process.env.BREVO_API_KEY = 'cle-brevo-test'; process.env.EMAIL_EXPEDITEUR = 'no-reply@retrouvid.sn'; });
  afterAll(() => { delete process.env.BREVO_API_KEY; delete process.env.EMAIL_EXPEDITEUR; });

  it("le code part directement par e-mail, n'est jamais renvoyé à l'écran, puis crée le compte", async () => {
    const r = await b.http().post('/auth/inscription').send(fiche('mail.awa@test.sn'));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ canal: 'email', email: 'm•••@test.sn', emailDisponible: true, smsDisponible: false });
    expect(r.body.codeSimule).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toMatch(/"[0-9]{6}"/);
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0].url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(envoyes[0].entetes['api-key']).toBe('cle-brevo-test');
    expect(envoyes[0].corps.to).toEqual([{ email: 'mail.awa@test.sn' }]);
    expect(envoyes[0].corps.sender.email).toBe('no-reply@retrouvid.sn');
    expect((await saisir(r.body.verificationId, autreCode(codeDe(envoyes[0])))).status).toBe(401);
    const ok = await saisir(r.body.verificationId, codeDe(envoyes[0]));
    expect(ok.status).toBe(201);
    expect(await nbComptes('mail.awa@test.sn')).toBe(1);
  });

  it("à la connexion, le code part à l'adresse du compte", async () => {
    const r = await b.http().post('/auth/inscription').send(fiche('mail.co@test.sn'));
    await saisir(r.body.verificationId, codeDe(envoyes[0]));
    envoyes.length = 0;
    const c = await b.http().post('/auth/connexion').send({ email: 'mail.co@test.sn', motDePasse: 'MotDePasse1' });
    expect(c.body).toMatchObject({ canal: 'email' });
    expect(c.body.codeSimule).toBeUndefined();
    expect(envoyes[0].corps.to).toEqual([{ email: 'mail.co@test.sn' }]);
    const ok = await saisir(c.body.verificationId, codeDe(envoyes[0]));
    expect(ok.status).toBe(201);
    expect(ok.body.jeton).toBeDefined();
  });

  it("une fois l'e-mail parti, on ne peut pas réclamer le code par SMS simulé", async () => {
    const r = await b.http().post('/auth/inscription').send(fiche('mail.sms@test.sn'));
    const s = await b.http().post('/auth/verification/renvoyer').send({ verificationId: r.body.verificationId, canal: 'sms' });
    expect(s.status).toBe(400);
    expect(JSON.stringify(s.body)).not.toMatch(/codeSimule/);
    const n = await b.http().post('/auth/verification/renvoyer').send({ verificationId: r.body.verificationId });
    expect(n.body).toMatchObject({ canal: 'email' });
    expect(n.body.codeSimule).toBeUndefined();
    expect(envoyes).toHaveLength(2);
  });

  it("sans configuration Brevo, l'e-mail n'est pas proposé ni simulé", async () => {
    delete process.env.BREVO_API_KEY;
    const r = await b.http().post('/auth/inscription').send(fiche('mail.sans@test.sn'));
    expect(r.body.emailDisponible).toBe(false);
    const m = await b.http().post('/auth/verification/renvoyer').send({ verificationId: r.body.verificationId, canal: 'email' });
    expect(m.status).toBe(400);
    expect(envoyes).toHaveLength(0);
  });

  it("si Brevo est injoignable, le SMS simulé prend le relais au lieu de bloquer", async () => {
    panne = true;
    const r = await b.http().post('/auth/inscription').send(fiche('mail.panne@test.sn'));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ canal: 'sms', emailEchoue: true, smsDisponible: true });
    expect(r.body.codeSimule).toMatch(/^[0-9]{6}$/);
    // nouvel essai par e-mail, toujours en panne : refus clair, puis le SMS reste possible
    const m = await b.http().post('/auth/verification/renvoyer').send({ verificationId: r.body.verificationId, canal: 'email' });
    expect(m.status).toBe(503);
    expect(m.body.message).toMatch(/SMS/);
    expect(JSON.stringify(m.body)).not.toMatch(/[0-9]{6}/);
    panne = false;
    const s = await b.http().post('/auth/verification/renvoyer').send({ verificationId: r.body.verificationId, canal: 'sms' });
    expect(s.status).toBe(201);
    expect(s.body.canal).toBe('sms');
    expect((await saisir(r.body.verificationId, s.body.codeSimule)).status).toBe(201);
  });

  it('refuse un canal inconnu', async () => {
    const r = await b.http().post('/auth/inscription').send(fiche('mail.canal@test.sn'));
    expect((await b.http().post('/auth/verification/renvoyer').send({ verificationId: r.body.verificationId, canal: 'pigeon' })).status).toBe(400);
  });
});

describe('code par e-mail via Gmail (SMTP)', () => {
  /** Faux transport SMTP : garde les messages, peut simuler un refus de Gmail. */
  const envoyes: any[] = [];
  let refus = false;
  const codeDe = (m: any) => /code RetrouvID : ([0-9]{6})/.exec(m.subject)![1];
  beforeAll(() => {
    b.app.get(EmailService).transportImpl = () => ({
      sendMail: async (m: any) => { if (refus) throw Object.assign(new Error('Invalid login'), { responseCode: 535, code: 'EAUTH' }); envoyes.push(m); return { messageId: 'x' }; },
    });
  });
  beforeEach(() => {
    envoyes.length = 0; refus = false;
    delete process.env.BREVO_API_KEY; delete process.env.EMAIL_EXPEDITEUR;
    process.env.SMTP_UTILISATEUR = 'retrouvid.test@gmail.com'; process.env.SMTP_MOT_DE_PASSE = 'abcd efgh ijkl mnop';
  });
  afterAll(() => { delete process.env.SMTP_UTILISATEUR; delete process.env.SMTP_MOT_DE_PASSE; b.app.get(EmailService).transportImpl = null; });

  it("envoie le code depuis l'adresse Gmail, sans l'afficher, puis crée le compte", async () => {
    const r = await b.http().post('/auth/inscription').send(fiche('smtp.awa@test.sn'));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ canal: 'email', emailDisponible: true, smsDisponible: false });
    expect(r.body.codeSimule).toBeUndefined();
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0].to).toBe('smtp.awa@test.sn');
    expect(envoyes[0].from).toBe('"RetrouvID" <retrouvid.test@gmail.com>');
    expect(envoyes[0].text).toContain(codeDe(envoyes[0]));
    expect((await saisir(r.body.verificationId, codeDe(envoyes[0]))).status).toBe(201);
  });

  it('si Gmail refuse (mauvais mot de passe d\'application), le SMS simulé prend le relais', async () => {
    refus = true;
    const r = await b.http().post('/auth/inscription').send(fiche('smtp.refus@test.sn'));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ canal: 'sms', emailEchoue: true });
    expect((await saisir(r.body.verificationId, r.body.codeSimule)).status).toBe(201);
  });
});
