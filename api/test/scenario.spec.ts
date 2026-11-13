process.env.DATABASE_URL = 'postgres://retrouvid:retrouvid_dev@localhost:5432/retrouvid_test';
process.env.JWT_SECRET = 'secret-de-test-assez-long-123';
process.env.AUTH_LIMIT = '1000';
process.env.VERIF_TELEPHONE = 'non'; // la vérification du téléphone est testée dans verification.spec.ts

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { migrate } from '../src/db/migrate';
import { configurer } from '../src/main';
import { GoogleVerifier } from '../src/auth/google';
import { UnauthorizedException } from '@nestjs/common';
import { PaydunyaService } from '../src/paiements/paydunya.service';
import { FauxPaydunya } from './aide';

const faux = new FauxPaydunya();

let app: INestApplication;
let pool: Pool;
const http = () => request(app.getHttpServer());

async function inscrire(email: string, _profil = 'citoyen', nom = 'Test') {
  const r = await http().post('/auth/inscription').send({ nom, prenom: 'Aminata', email, telephone: '771234567', motDePasse: 'MotDePasse1' });
  expect(r.status).toBe(201);
  return r.body.jeton as string;
}
async function compteInterne(email: string, role: 'agent' | 'admin') {
  await pool.query(`INSERT INTO comptes (nom, prenom, email, telephone, mot_de_passe_hache, role) VALUES ('Int','Erne',$1,'770000000',$2,$3)`,
    [email, await hash('MotDePasse1', 4), role]);
  const r = await http().post('/auth/connexion').send({ email, motDePasse: 'MotDePasse1' });
  expect(r.status).toBe(201);
  return r.body.jeton as string;
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

const decl = { typeDocument: 'cni', numero: '1 234 567 890 123', nomProprietaire: 'Awa Diop', dateNaissance: '1999-04-12', lieuPerte: 'Marché Sandaga, Dakar', datePerte: '2026-10-20' };
const sig = { typeDocument: 'cni', numero: '1234567890123', nomSurDocument: 'DIOP AWA', dateNaissance: '1999-04-12', lieuTrouve: 'Gare routière Pompiers', dateTrouve: '2026-10-22' };

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(process.env.DATABASE_URL);
  // faux vérificateur : "valide:<sub>:<email>[:non-verifie]" tient lieu de jeton Google
  const fauxGoogle = { verifier: async (t: string) => {
    const [ok, sub, email, v] = t.split(':');
    if (ok !== 'valide') throw new UnauthorizedException('Jeton Google invalide ou expiré');
    return { sub, email, emailVerifie: v !== 'non-verifie', prenom: 'Fatou', nom: 'Ba' };
  } };
  const m = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(GoogleVerifier).useValue(fauxGoogle).compile();
  app = configurer(m.createNestApplication());
  await app.init();
  app.get(PaydunyaService).fetchImpl = faux.fetch as typeof fetch;
});
afterAll(async () => { await app.close(); await pool.end(); });

describe('parcours complet', () => {
  let citoyen: string, decouvreur: string, agent: string, admin: string, corr: string, declId: string, sigId: string;

  it('inscription, déclaration, signalement et rapprochement automatique', async () => {
    citoyen = await inscrire('awa@test.sn', 'citoyen');
    decouvreur = await inscrire('moussa@test.sn', 'citoyen');
    agent = await compteInterne('agent@test.sn', 'agent');
    admin = await compteInterne('admin@test.sn', 'admin');

    const d = await http().post('/declarations').set(auth(citoyen)).send(decl);
    expect(d.status).toBe(201);
    declId = d.body.id;
    expect(d.body.numero).toBe('1234567890123');

    const s = await http().post('/signalements').set(auth(decouvreur)).send(sig);
    expect(s.status).toBe(201);
    sigId = s.body.id;
    expect(s.body.numero).toBeUndefined();

    const file = await http().get('/agent/correspondances').set(auth(agent));
    expect(file.body).toHaveLength(1);
    corr = file.body[0].id;
    expect(file.body[0].score).toBe(100);
    expect(file.body[0].declaration.numero).toBe('**********123');
    expect(JSON.stringify(file.body)).not.toContain('Awa Diop');
  });

  it("l'ordre des étapes est imposé", async () => {
    expect((await http().post(`/correspondances/${corr}/valider`).set(auth(citoyen))).status).toBe(400);
    expect((await http().post(`/correspondances/${corr}/payer`).set(auth(citoyen))).status).toBe(400);
    expect((await http().get(`/correspondances/${corr}/coordonnees`).set(auth(citoyen))).status).toBe(403);
    const vue = await http().get('/correspondances').set(auth(citoyen));
    expect(vue.body[0].signalement).toBeNull();
  });

  it('double validation, paiement PayDunya, coordonnées, remise confirmée par les deux parties', async () => {
    expect((await http().post(`/agent/correspondances/${corr}/valider`).set(auth(agent))).status).toBe(201);
    expect((await http().post(`/correspondances/${corr}/valider`).set(auth(citoyen))).status).toBe(201);
    const p = await http().post(`/correspondances/${corr}/payer`).set(auth(citoyen));
    expect(p.status).toBe(201);
    expect(p.body.montant).toBe(1000);
    expect(p.body.url).toMatch(/^https:\/\/app\.paydunya\.com\//);
    // tant que PayDunya n'a pas confirmé, rien n'est débloqué
    expect((await http().get(`/correspondances/${corr}/coordonnees`).set(auth(citoyen))).status).toBe(403);
    faux.regler('completed');
    const retour = await http().get(`/correspondances/${corr}/paiement`).set(auth(citoyen));
    expect(retour.body).toEqual({ statut: 'reussi', etat: 'payee' });
    const coord = await http().get(`/correspondances/${corr}/coordonnees`).set(auth(citoyen));
    expect(coord.body.telephone).toBe('771234567');

    const r1 = await http().post(`/correspondances/${corr}/confirmer-remise`).set(auth(citoyen));
    expect(r1.body.remise_complete).toBe(false);
    const r2 = await http().post(`/correspondances/${corr}/confirmer-remise`).set(auth(decouvreur));
    expect(r2.body.remise_complete).toBe(true);
    const e = await pool.query('SELECT etat FROM declarations WHERE id = $1', [declId]);
    expect(e.rows[0].etat).toBe('remis');
  });

  it("l'administrateur consulte une donnée masquée (journalisée) puis clôture et anonymise", async () => {
    const lu = await http().get(`/admin/signalements/${sigId}`).set(auth(admin));
    expect(lu.body.numero).toBe('1234567890123');
    const j = await http().get('/admin/journal?action=consultation_donnees_masquees').set(auth(admin));
    expect(j.body.length).toBe(1);
    expect(j.body[0].compte).toBe('admin@test.sn');

    expect((await http().post(`/admin/correspondances/${corr}/cloturer`).set(auth(admin))).status).toBe(201);
    const d = await pool.query('SELECT numero, nom_proprietaire, etat FROM declarations WHERE id = $1', [declId]);
    expect(d.rows[0]).toEqual({ numero: 'ANONYMISE', nom_proprietaire: 'ANONYMISE', etat: 'cloture' });
    const pay = await pool.query('SELECT statut FROM paiements');
    expect(pay.rows[0].statut).toBe('reussi');
  });
});

describe('un même compte perd un document et en trouve un autre', () => {
  it('voit les deux côtés, sans se rapprocher de lui-même', async () => {
    const x = await inscrire('xx@test.sn', 'citoyen');
    const y = await inscrire('yy@test.sn', 'citoyen');
    // X perd le document A ; Y le trouve
    await http().post('/declarations').set(auth(x)).send({ ...decl, numero: 'AA11223344', nomProprietaire: 'Ibrahima Fall' });
    await http().post('/signalements').set(auth(y)).send({ ...sig, numero: 'AA11223344', nomSurDocument: 'Ibrahima Fall' });
    // Y perd le document B ; X le trouve
    await http().post('/declarations').set(auth(y)).send({ ...decl, numero: 'BB55667788', nomProprietaire: 'Khady Sow' });
    await http().post('/signalements').set(auth(x)).send({ ...sig, numero: 'BB55667788', nomSurDocument: 'Khady Sow' });
    // X déclare et signale le même document : aucune correspondance avec lui-même
    await http().post('/declarations').set(auth(x)).send({ ...decl, numero: 'CC00112233', nomProprietaire: 'Seydou Ndiaye' });
    await http().post('/signalements').set(auth(x)).send({ ...sig, numero: 'CC00112233', nomSurDocument: 'Seydou Ndiaye' });

    const l = (await http().get('/correspondances').set(auth(x))).body;
    expect(l).toHaveLength(2);
    expect(l.map((c: any) => c.cote).sort()).toEqual(['perte', 'trouvaille']);

    // du côté « trouvaille », X ne peut ni confirmer comme propriétaire, ni payer, ni voir les coordonnées
    const trouvaille = l.find((c: any) => c.cote === 'trouvaille');
    expect((await http().post(`/correspondances/${trouvaille.id}/valider`).set(auth(x))).status).toBe(403);
    expect((await http().post(`/correspondances/${trouvaille.id}/payer`).set(auth(x))).status).toBe(403);
    expect((await http().get(`/correspondances/${trouvaille.id}/coordonnees`).set(auth(x))).status).toBe(403);
  });
});

describe('contrôle des accès', () => {
  it('refuse sans jeton, avec le mauvais rôle, ou sur le dossier d\'un autre', async () => {
    expect((await http().get('/declarations')).status).toBe(401);
    const a = await inscrire('a@test.sn', 'citoyen');
    const b = await inscrire('b@test.sn', 'citoyen');
    const dec = await inscrire('c@test.sn', 'citoyen');
    expect((await http().get('/admin/stats').set(auth(a))).status).toBe(403);

    // un autre citoyen ne peut pas agir sur la correspondance d'Awa
    await http().post('/declarations').set(auth(a)).send({ ...decl, numero: 'ZZ99887766', nomProprietaire: 'Fatou Ba' });
    await http().post('/signalements').set(auth(dec)).send({ ...sig, numero: 'ZZ99887766', nomSurDocument: 'Fatou Ba' });
    const agent = (await http().post('/auth/connexion').send({ email: 'agent@test.sn', motDePasse: 'MotDePasse1' })).body.jeton;
    const file = await http().get('/agent/correspondances').set(auth(agent));
    const id = file.body[0].id;
    await http().post(`/agent/correspondances/${id}/valider`).set(auth(agent));
    expect((await http().post(`/correspondances/${id}/valider`).set(auth(b))).status).toBe(403);
    expect((await http().get(`/correspondances/${id}/coordonnees`).set(auth(dec))).status).toBe(403);
  });

  it('refuse un compte désactivé', async () => {
    const t = await inscrire('x@test.sn', 'citoyen');
    await pool.query(`UPDATE comptes SET actif=false WHERE email='x@test.sn'`);
    expect((await http().get('/declarations').set(auth(t))).status).toBe(401);
  });
});

describe('règles de gestion', () => {
  it("écarter une correspondance remet les dossiers en attente", async () => {
    const c = await inscrire('d@test.sn', 'citoyen');
    const f = await inscrire('e@test.sn', 'citoyen');
    const agent = (await http().post('/auth/connexion').send({ email: 'agent@test.sn', motDePasse: 'MotDePasse1' })).body.jeton;
    const d = await http().post('/declarations').set(auth(c)).send({ ...decl, numero: 'PP00112233', nomProprietaire: 'Ibrahima Sow' });
    await http().post('/signalements').set(auth(f)).send({ ...sig, numero: 'PP00112233', nomSurDocument: 'Autre Personne', dateNaissance: '1980-01-01' });
    const file = (await http().get('/agent/correspondances').set(auth(agent))).body.find((x: any) => x.score === 50);
    expect(file.champs_concordants).toEqual(['numero']);
    await http().post(`/agent/correspondances/${file.id}/ecarter`).set(auth(agent));
    const e = await pool.query('SELECT etat FROM declarations WHERE id = $1', [d.body.id]);
    expect(e.rows[0].etat).toBe('en_attente');
  });

  it('valide les entrées', async () => {
    const c = await inscrire('g@test.sn', 'citoyen');
    expect((await http().post('/declarations').set(auth(c)).send({ ...decl, datePerte: '2099-01-01' })).status).toBe(400);
    expect((await http().post('/declarations').set(auth(c)).send({ ...decl, typeDocument: 'carte-vitale' })).status).toBe(400);
    expect((await http().post('/declarations').set(auth(c)).send({ ...decl, champInconnu: 1 })).status).toBe(400);
    const faible = await http().post('/auth/inscription').send({ nom: 'A', prenom: 'B', email: 'h@test.sn', telephone: '771234567', motDePasse: 'court' });
    expect(faible.status).toBe(400);
    const doublon = await http().post('/auth/inscription').send({ nom: 'Test', prenom: 'Aminata', email: 'g@test.sn', telephone: '771234567', motDePasse: 'MotDePasse1' });
    expect(doublon.status).toBe(409);
  });

  it('le tableau de bord est réservé à l\'admin et ne contient aucune donnée personnelle', async () => {
    const citoyen = await inscrire('tb1@test.sn');
    expect((await http().get('/admin/tableau').set(auth(citoyen))).status).toBe(403);
    const admin = await compteInterne('tb-admin@test.sn', 'admin');
    const r = await http().get('/admin/tableau').set(auth(admin));
    expect(r.status).toBe(200);
    expect(r.body.declarations).toHaveLength(14);
    expect(JSON.stringify(r.body)).not.toMatch(/tb1@test\.sn/);
  });

  it('la photo d\'un document trouvé est contrôlée et réservée à son auteur, aux agents et à l\'admin', async () => {
    const jpeg = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64');
    const a = await inscrire('ph-a@test.sn'), b = await inscrire('ph-b@test.sn'), agent = await compteInterne('ph-agent@test.sn', 'agent');
    const d = { ...decl, numero: '9988776655443' }, s = { ...sig, numero: '9988776655443' };
    await http().post('/declarations').set(auth(a)).send(d).expect(201);
    // faux JPEG déclaré en PNG, ou texte déguisé : refusés avant toute écriture
    await http().post('/signalements').set(auth(b)).send({ ...s, photo: jpeg.replace('image/jpeg', 'image/png') }).expect(400);
    await http().post('/signalements').set(auth(b)).send({ ...s, photo: 'data:image/jpeg;base64,' + Buffer.from('pas une image').toString('base64') }).expect(400);
    const r = await http().post('/signalements').set(auth(b)).send({ ...s, photo: jpeg }).expect(201);
    expect(r.body.a_photo).toBe(true);
    await http().get(`/signalements/${r.body.id}/photo`).set(auth(b)).expect(200).expect('Content-Type', /image\/jpeg/);
    await http().get(`/signalements/${r.body.id}/photo`).set(auth(a)).expect(403);
    const file = await http().get('/agent/correspondances').set(auth(agent));
    const c = file.body.find((x: any) => x.signalement.a_photo);
    expect(c).toBeTruthy();
    await http().get(`/agent/correspondances/${c.id}/photo`).set(auth(agent)).expect(200);
    await http().get(`/agent/correspondances/${c.id}/photo`).set(auth(a)).expect(403);
    const journal = await pool.query("SELECT 1 FROM journal_actions WHERE action = 'consultation_photo'");
    expect(journal.rowCount).toBeGreaterThan(0);
  });

  it('connexion avec Google : téléphone demandé, compte créé, jamais rattaché à un compte à mot de passe', async () => {
    const jeton = (sub: string, email: string, v = '') => `valide:${sub}:${email}${v ? ':' + v : ''}:`.padEnd(30, 'x');
    // faux jeton refusé
    await http().post('/auth/google').send({ credential: 'n-importe-quoi-mais-assez-long-pour-passer' }).expect(401);
    // premier passage : le serveur demande le téléphone et ne crée rien
    const g = jeton('sub-1', 'fatou.ba@gmail.test');
    const r1 = await http().post('/auth/google').send({ credential: g }).expect(201);
    expect(r1.body.telephoneRequis).toBe(true);
    expect((await pool.query("SELECT 1 FROM comptes WHERE email = 'fatou.ba@gmail.test'")).rowCount).toBe(0);
    await http().post('/auth/google').send({ credential: g, telephone: 'abc' }).expect(400);
    // avec le téléphone : compte citoyen créé, jeton valable
    const r2 = await http().post('/auth/google').send({ credential: g, telephone: '77 123 45 67' }).expect(201);
    expect(r2.body.compte.role).toBe('citoyen');
    await http().get('/auth/moi').set(auth(r2.body.jeton)).expect(200);
    // retour : connexion directe
    expect((await http().post('/auth/google').send({ credential: g }).expect(201)).body.compte.email).toBe('fatou.ba@gmail.test');
    // l'e-mail d'un compte à mot de passe n'est pas rattaché automatiquement
    await inscrire('deja@test.sn');
    await http().post('/auth/google').send({ credential: jeton('sub-2', 'deja@test.sn'), telephone: '771234567' }).expect(409);
    // e-mail non vérifié chez Google
    await http().post('/auth/google').send({ credential: jeton('sub-3', 'nv@gmail.test', 'non-verifie'), telephone: '771234567' }).expect(401);
    // un compte Google désactivé ne se connecte plus
    await pool.query("UPDATE comptes SET actif = false WHERE google_sub = 'sub-1'");
    await http().post('/auth/google').send({ credential: g }).expect(401);
    // un compte créé par Google ne peut pas se connecter avec un mot de passe deviné
    await http().post('/auth/connexion').send({ email: 'fatou.ba@gmail.test', motDePasse: 'Demo12345' }).expect(401);
  });
});
