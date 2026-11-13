import { createHash } from 'crypto';
import { auth, Banc, compteInterne, decl, demarrer, inscrire, sig } from './aide';
import { PaydunyaService } from '../src/paiements/paydunya.service'; // après ./aide : celui-ci fixe les variables d'environnement avant que config.ts ne les lise

/** Paiement réel via PayDunya : le serveur PayDunya est remplacé par un faux (voir aide.ts), aucun appel réseau n'est émis. */
let b: Banc;
let agent: string;
const empreinte = createHash('sha512').update('cle-maitre-de-test').digest('hex');
/** Notification telle que PayDunya l'envoie : formulaire dont les champs sont regroupés sous « data ». */
const ipn = (jeton: string, hash = empreinte) => b.http().post('/paiements/paydunya/ipn').type('form')
  .send({ 'data[invoice][token]': jeton, 'data[status]': 'completed', 'data[hash]': hash });

beforeAll(async () => { b = await demarrer(); agent = await compteInterne(b, 'agent-pd@test.sn', 'agent'); });
afterAll(async () => { await b.fermer(); });

let n = 0;
/** Prépare une correspondance validée par l'agent puis par le citoyen : l'étape juste avant le paiement. */
async function preparer() {
  n++;
  const num = String(5000000000000 + n);
  const citoyen = await inscrire(b, `pd-c${n}@test.sn`), decouvreur = await inscrire(b, `pd-d${n}@test.sn`);
  const d = (await b.http().post('/declarations').set(auth(citoyen)).send({ ...decl, numero: num, nomProprietaire: 'Awa Diop', dateNaissance: undefined })).body;
  await b.http().post('/signalements').set(auth(decouvreur)).send({ ...sig, numero: num, nomSurDocument: 'DIOP AWA', dateNaissance: undefined });
  const c = (await b.pool.query('SELECT id FROM correspondances WHERE declaration_id=$1', [d.id])).rows[0].id as string;
  await b.http().post(`/agent/correspondances/${c}/valider`).set(auth(agent));
  await b.http().post(`/correspondances/${c}/valider`).set(auth(citoyen));
  const etat = async () => (await b.pool.query('SELECT etat FROM correspondances WHERE id=$1', [c])).rows[0].etat;
  return { c, citoyen, decouvreur, etat, payer: () => b.http().post(`/correspondances/${c}/payer`).set(auth(citoyen)) };
}

describe('ouverture du paiement', () => {
  it("envoie à PayDunya les clés en en-têtes, le montant du serveur et aucune donnée du document", async () => {
    const p = await preparer();
    const r = await p.payer();
    expect(r.status).toBe(201);
    expect(r.body.montant).toBe(1000);
    expect(r.body.url).toMatch(/^https:\/\/app\.paydunya\.com\/sandbox-checkout\/invoice\//);
    const f = b.paydunya.factures.get(b.paydunya.dernier)!;
    expect(f.entetes['PAYDUNYA-MASTER-KEY']).toBe('cle-maitre-de-test');
    expect(f.entetes['PAYDUNYA-PRIVATE-KEY']).toBe('cle-privee-de-test');
    expect(f.entetes['PAYDUNYA-TOKEN']).toBe('jeton-de-test');
    expect(f.corps.invoice.channels).toEqual(['wave-senegal', 'orange-money-senegal']);
    expect(f.corps.actions.return_url).toBe(`https://app.exemple.sn/paiement/retour/${p.c}`);
    expect(f.corps.actions.cancel_url).toBe(`https://app.exemple.sn/paiement/retour/${p.c}?annule=1`);
    expect(f.corps.actions.callback_url).toBe('https://api.exemple.sn/paiements/paydunya/ipn');
    expect(f.corps.custom_data).toEqual({ correspondance_id: p.c });
    expect(JSON.stringify(f.corps)).not.toMatch(/Diop|DIOP|5000000/);
    // les clés ne reviennent jamais au navigateur : il ne reçoit que l'adresse de la page de paiement
    expect(JSON.stringify(r.body)).not.toMatch(/cle-|jeton-de-test/);
    expect(Object.keys(r.body).sort()).toEqual(['montant', 'ok', 'url']);
    expect(await p.etat()).toBe('validee_citoyen');
    expect((await b.http().get(`/correspondances/${p.c}/coordonnees`).set(auth(p.citoyen))).status).toBe(403);
  });

  it("n'accepte aucun montant venant du navigateur", async () => {
    const p = await preparer();
    const r = await b.http().post(`/correspondances/${p.c}/payer`).set(auth(p.citoyen)).send({ montant: 1 });
    expect(r.status).toBe(201);
    expect(b.paydunya.factures.get(b.paydunya.dernier)!.montant).toBe(1000);
  });

  it("accepte l'adresse de paiement telle que PayDunya la renvoie, sur paydunya.com ou app.paydunya.com", async () => {
    const p = await preparer();
    const svc = b.app.get(PaydunyaService), normal = svc.fetchImpl;
    svc.fetchImpl = (async (url: any, init: any) => {
      const r = await normal(url, init);
      if (!String(url).endsWith('/create')) return r;
      const o = await r.json();
      return new Response(JSON.stringify({ ...o, response_text: `https://paydunya.com/sandbox-checkout/invoice/${o.token}` }), { status: 200 });
    }) as typeof fetch;
    try {
      const r = await p.payer();
      expect(r.status).toBe(201);
      expect(r.body.url).toBe(`https://paydunya.com/sandbox-checkout/invoice/${b.paydunya.dernier}`);
    } finally { svc.fetchImpl = normal; }
  });

  it("refuse une adresse de paiement qui n'appartient pas à PayDunya", async () => {
    const p = await preparer();
    const svc = b.app.get(PaydunyaService), normal = svc.fetchImpl;
    svc.fetchImpl = (async (url: any, init: any) => {
      const r = await normal(url, init);
      if (!String(url).endsWith('/create')) return r;
      const o = await r.json();
      return new Response(JSON.stringify({ ...o, response_text: 'https://paydunya.com.pirate.example/pay' }), { status: 200 });
    }) as typeof fetch;
    try { expect((await p.payer()).status).toBe(502); } finally { svc.fetchImpl = normal; }
    expect(await p.etat()).toBe('validee_citoyen');
  });

  it('un double clic réutilise la même facture au lieu d’en créer une seconde', async () => {
    const p = await preparer();
    const avant = b.paydunya.factures.size;
    const [r1, r2] = await Promise.all([p.payer(), p.payer()]);
    expect(r1.body.url).toBe(r2.body.url);
    expect(b.paydunya.factures.size).toBe(avant + 1);
    expect((await b.pool.query('SELECT count(*)::int AS n FROM paiements WHERE correspondance_id=$1', [p.c])).rows[0].n).toBe(1);
  });

  it("refuse un autre citoyen et l'étape trop précoce", async () => {
    const p = await preparer();
    const autre = await inscrire(b, `pd-intrus${n}@test.sn`);
    expect((await b.http().post(`/correspondances/${p.c}/payer`).set(auth(autre))).status).toBe(403);
    expect((await b.http().get(`/correspondances/${p.c}/paiement`).set(auth(autre))).status).toBe(403);
    expect((await b.http().post(`/correspondances/${p.c}/payer`).set(auth(p.decouvreur))).status).toBe(403);
    expect((await b.http().post(`/correspondances/${p.c}/payer`)).status).toBe(401);
  });

  it("répond 503 tant que les clés PayDunya ne sont pas renseignées", async () => {
    const p = await preparer();
    const cle = process.env.PAYDUNYA_MASTER_KEY;
    process.env.PAYDUNYA_MASTER_KEY = '';
    try {
      expect((await p.payer()).status).toBe(503);
      const vue = await b.http().get('/correspondances').set(auth(p.citoyen));
      expect(vue.body[0].paiement_disponible).toBe(false);
    } finally { process.env.PAYDUNYA_MASTER_KEY = cle; }
    expect(await p.etat()).toBe('validee_citoyen');
  });

  it("signale un refus de PayDunya (clé invalide) sans rien débloquer ni exposer le détail", async () => {
    const p = await preparer();
    b.paydunya.refus = true;
    try {
      const r = await p.payer();
      expect(r.status).toBe(502);
      expect(JSON.stringify(r.body)).not.toMatch(/Clés invalides|1001|cle-/);
    } finally { b.paydunya.refus = false; }
    expect(await p.etat()).toBe('validee_citoyen');
  });

  it('signale une panne de PayDunya sans rien débloquer', async () => {
    const p = await preparer();
    b.paydunya.panne = true;
    try { expect((await p.payer()).status).toBe(502); } finally { b.paydunya.panne = false; }
    expect(await p.etat()).toBe('validee_citoyen');
    expect((await p.payer()).status).toBe(201);
  });
});

describe('confirmation du paiement', () => {
  it('la page de retour débloque après confirmation de PayDunya, une seule fois', async () => {
    const p = await preparer();
    await p.payer();
    const jeton = b.paydunya.dernier;
    // retour sans avoir payé : toujours en attente
    expect((await b.http().get(`/correspondances/${p.c}/paiement`).set(auth(p.citoyen))).body).toEqual({ statut: 'en_attente', etat: 'validee_citoyen' });
    b.paydunya.regler('completed');
    const r = await b.http().get(`/correspondances/${p.c}/paiement`).set(auth(p.citoyen));
    expect(r.body).toEqual({ statut: 'reussi', etat: 'payee' });
    await b.http().get(`/correspondances/${p.c}/paiement`).set(auth(p.citoyen));
    await ipn(jeton);
    const j = await b.pool.query(`SELECT count(*)::int AS n FROM journal_actions WHERE action='paiement_reussi' AND objet_id=$1`, [p.c]);
    expect(j.rows[0].n).toBe(1);
    const nt = await b.pool.query(`SELECT count(*)::int AS n FROM notifications WHERE type='coordonnees'`);
    expect(nt.rows[0].n).toBeGreaterThanOrEqual(1);
    expect((await b.http().get(`/correspondances/${p.c}/coordonnees`).set(auth(p.citoyen))).status).toBe(200);
    expect((await b.pool.query('SELECT statut, fournisseur FROM paiements WHERE correspondance_id=$1', [p.c])).rows[0]).toEqual({ statut: 'reussi', fournisseur: 'paydunya' });
  });

  it("la notification IPN débloque aussi, et rejoue sans effet", async () => {
    const p = await preparer();
    await p.payer();
    const jeton = b.paydunya.dernier;
    b.paydunya.regler('completed');
    expect((await ipn(jeton)).status).toBe(200);
    expect(await p.etat()).toBe('payee');
    expect((await ipn(jeton)).status).toBe(200);
    expect((await b.pool.query(`SELECT count(*)::int AS n FROM remises WHERE correspondance_id=$1`, [p.c])).rows[0].n).toBe(1);
  });

  it("rejette une notification à l'empreinte fausse ou sans jeton, sans appeler PayDunya", async () => {
    const p = await preparer();
    await p.payer();
    const jeton = b.paydunya.dernier;
    b.paydunya.regler('completed');
    const appels = b.paydunya.appels.length;
    expect((await ipn(jeton, 'x'.repeat(128))).status).toBe(400);
    expect((await b.http().post('/paiements/paydunya/ipn').type('form').send({ 'data[hash]': empreinte })).status).toBe(400);
    expect((await b.http().post('/paiements/paydunya/ipn').send({})).status).toBe(400);
    expect(b.paydunya.appels.length).toBe(appels);
    expect(await p.etat()).toBe('validee_citoyen');
  });

  it("ne croit pas une notification : un jeton déclaré payé par erreur reste en attente si PayDunya dit pending", async () => {
    const p = await preparer();
    await p.payer();
    expect((await ipn(b.paydunya.dernier)).status).toBe(200);
    expect(await p.etat()).toBe('validee_citoyen');
  });

  it("refuse un montant différent de celui attendu", async () => {
    const p = await preparer();
    await p.payer();
    const f = b.paydunya.factures.get(b.paydunya.dernier)!;
    f.montant = 10; f.statut = 'completed';
    await b.http().get(`/correspondances/${p.c}/paiement`).set(auth(p.citoyen));
    expect(await p.etat()).toBe('validee_citoyen');
    expect((await b.pool.query('SELECT statut FROM paiements WHERE correspondance_id=$1', [p.c])).rows[0].statut).toBe('echoue');
  });

  it("après une annulation, une nouvelle tentative crée une nouvelle facture", async () => {
    const p = await preparer();
    await p.payer();
    const premier = b.paydunya.dernier;
    b.paydunya.regler('cancelled');
    expect((await b.http().get(`/correspondances/${p.c}/paiement`).set(auth(p.citoyen))).body.statut).toBe('annule');
    const r = await p.payer();
    expect(r.status).toBe(201);
    expect(b.paydunya.dernier).not.toBe(premier);
    b.paydunya.regler('completed');
    expect((await b.http().get(`/correspondances/${p.c}/paiement`).set(auth(p.citoyen))).body.etat).toBe('payee');
    // un second paiement sur la même correspondance est refusé
    expect((await p.payer()).status).toBe(400);
  });

  it("une notification perdue est rattrapée quand le citoyen relance le paiement", async () => {
    const p = await preparer();
    await p.payer();
    b.paydunya.regler('completed');
    const r = await p.payer();
    expect(r.status).toBe(400);
    expect(await p.etat()).toBe('payee');
  });
});
