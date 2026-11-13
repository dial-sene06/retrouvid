import { auth, Banc, payer, compteInterne, decl, demarrer, inscrire, sig } from './aide';

let b: Banc;
beforeAll(async () => { b = await demarrer(); });
afterAll(async () => { await b.fermer(); });
afterEach(() => jest.restoreAllMocks());

/** Un nom propre à chaque numéro : sans cela, les dossiers de tests différents se rapprochent entre eux. */
const nomDe = (numero: string) => `Nom${numero}`;
const D = (numero: string, plus: object = {}) => ({ ...decl, numero, nomProprietaire: nomDe(numero), dateNaissance: undefined, ...plus });
const S = (numero: string, plus: object = {}) => ({ ...sig, numero, nomSurDocument: nomDe(numero), dateNaissance: undefined, ...plus });

const DAKAR = { lat: 14.6937, lng: -17.4441 };
const THIES = { lat: 14.791, lng: -16.9359 };

/** Identifiant de la correspondance née d'un numéro de document. */
async function corrDe(numero: string): Promise<string> {
  const r = await b.pool.query(
    `SELECT c.id FROM correspondances c JOIN declarations d ON d.id = c.declaration_id WHERE d.numero = $1`, [numero]);
  return r.rows[0].id;
}

describe('géolocalisation', () => {
  it("accepte une position GPS, refuse une moitié de position, donne la distance à l'agent", async () => {
    const c = await inscrire(b, 'geo.c@test.sn'), f = await inscrire(b, 'geo.f@test.sn');
    const agent = await compteInterne(b, 'geo.agent@test.sn', 'agent');
    expect((await b.http().post('/declarations').set(auth(c)).send({ ...decl, lat: 14.69 })).status).toBe(400);
    expect((await b.http().post('/declarations').set(auth(c)).send({ ...decl, lat: 95, lng: 0 })).status).toBe(400);

    expect((await b.http().post('/declarations').set(auth(c)).send(D('GEO123456', DAKAR))).status).toBe(201);
    expect((await b.http().post('/signalements').set(auth(f)).send(S('GEO123456', THIES))).status).toBe(201);

    const file = await b.http().get('/agent/correspondances').set(auth(agent));
    const x = file.body.find((y: any) => y.declaration.lat === DAKAR.lat);
    expect(x.signalement.lat).toBe(THIES.lat);
    expect(x.distance_km).toBeGreaterThan(50);
    expect(x.distance_km).toBeLessThan(60);
  });

  it('sans position, la distance est absente et rien ne casse', async () => {
    const c = await inscrire(b, 'nogeo.c@test.sn'), f = await inscrire(b, 'nogeo.f@test.sn');
    const agent = await compteInterne(b, 'nogeo.agent@test.sn', 'agent');
    await b.http().post('/declarations').set(auth(c)).send(D('NOGEO9999'));
    await b.http().post('/signalements').set(auth(f)).send(S('NOGEO9999'));
    const id = await corrDe('NOGEO9999');
    const file = await b.http().get('/agent/correspondances').set(auth(agent));
    expect(file.body.find((y: any) => y.id === id).distance_km).toBeNull();
  });

  it('le géocodage passe par le serveur et se dégrade sans erreur quand le service est injoignable', async () => {
    const t = await inscrire(b, 'geo.api@test.sn');
    const reponse = { display_name: 'Quelque part', address: { road: 'Avenue Cheikh Anta Diop', suburb: 'Fann', city: 'Dakar' } };
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(reponse), { status: 200 }));
    const r = await b.http().get('/geo/inverse?lat=14.69&lng=-17.46').set(auth(t));
    expect(r.body.adresse).toBe('Avenue Cheikh Anta Diop, Fann, Dakar');
    expect(String(spy.mock.calls[0][0])).toContain('/reverse');

    const liste = [{ lat: '14.7', lon: '-17.4', address: { road: 'Rue 10', city: 'Dakar' } }];
    spy.mockResolvedValue(new Response(JSON.stringify(liste), { status: 200 }));
    const s = await b.http().get('/geo/recherche?q=Medina').set(auth(t));
    expect(s.body.lieux).toEqual([{ adresse: 'Rue 10, Dakar', lat: 14.7, lng: -17.4 }]);
    expect(String(spy.mock.calls[1][0])).toContain('countrycodes=sn');

    // même requête : réutilisée sans nouvel appel au service
    const n = spy.mock.calls.length;
    expect((await b.http().get('/geo/inverse?lat=14.69&lng=-17.46').set(auth(t))).body.adresse).toBe('Avenue Cheikh Anta Diop, Fann, Dakar');
    expect(spy.mock.calls.length).toBe(n);

    spy.mockRejectedValue(new Error('réseau coupé'));
    const r2 = await b.http().get('/geo/inverse?lat=14.50&lng=-17.10').set(auth(t));
    expect(r2.status).toBe(200);
    expect(r2.body.adresse).toBeNull();
    expect((await b.http().get('/geo/recherche?q=Rufisque').set(auth(t))).body.lieux).toEqual([]);

    expect((await b.http().get('/geo/inverse?lat=abc&lng=1').set(auth(t))).status).toBe(400);
    expect((await b.http().get('/geo/recherche?q=ab').set(auth(t))).status).toBe(400);
    expect((await b.http().get('/geo/inverse?lat=14&lng=-17')).status).toBe(401);
  });
});

describe('corriger et supprimer ses dossiers', () => {
  it("un signalement se corrige puis se supprime tant qu'il est en attente, jamais celui d'un autre", async () => {
    const f = await inscrire(b, 'cor.f@test.sn'), autre = await inscrire(b, 'cor.autre@test.sn');
    const s = await b.http().post('/signalements').set(auth(f)).send(S('COR000111'));
    expect(s.status).toBe(201);
    const id = s.body.id;
    expect((await b.http().patch(`/signalements/${id}`).set(auth(autre)).send(S('COR000111'))).status).toBe(403);
    const m = await b.http().patch(`/signalements/${id}`).set(auth(f)).send(S('COR000222', { lieuTrouve: 'Rufisque', ...DAKAR }));
    expect(m.status).toBe(200);
    const l = await b.pool.query('SELECT numero, lieu_trouve, lat FROM signalements WHERE id = $1', [id]);
    expect(l.rows[0]).toEqual({ numero: 'COR000222', lieu_trouve: 'Rufisque', lat: DAKAR.lat });
    expect((await b.http().delete(`/signalements/${id}`).set(auth(autre))).status).toBe(403);
    expect((await b.http().delete(`/signalements/${id}`).set(auth(f))).status).toBe(200);
    expect((await b.pool.query('SELECT 1 FROM signalements WHERE id = $1', [id])).rowCount).toBe(0);
  });

  it('une déclaration rapprochée ne peut plus être supprimée, une déclaration en attente le peut', async () => {
    const c = await inscrire(b, 'sup.c@test.sn'), f = await inscrire(b, 'sup.f@test.sn');
    const seule = await b.http().post('/declarations').set(auth(c)).send(D('SUP00001A'));
    expect((await b.http().delete(`/declarations/${seule.body.id}`).set(auth(c))).status).toBe(200);

    const d = await b.http().post('/declarations').set(auth(c)).send(D('SUP00002B'));
    await b.http().post('/signalements').set(auth(f)).send(S('SUP00002B'));
    expect((await b.http().delete(`/declarations/${d.body.id}`).set(auth(c))).status).toBe(400);
  });

  it("la photo d'un signalement est conservée si absente, retirée si chaîne vide", async () => {
    const f = await inscrire(b, 'cor.photo@test.sn');
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const s = await b.http().post('/signalements').set(auth(f)).send(S('PHO000333', { photo: png }));
    expect(s.status).toBe(201);
    const id = s.body.id;
    const nb = async () => (await b.pool.query('SELECT 1 FROM signalement_photos WHERE signalement_id = $1', [id])).rowCount;
    expect(await nb()).toBe(1);
    await b.http().patch(`/signalements/${id}`).set(auth(f)).send(S('PHO000333'));
    expect(await nb()).toBe(1);
    await b.http().patch(`/signalements/${id}`).set(auth(f)).send(S('PHO000333', { photo: '' }));
    expect(await nb()).toBe(0);
  });
});

describe('discussion après paiement', () => {
  it('fermée avant le paiement, réservée aux deux parties, effacée à la clôture', async () => {
    const c = await inscrire(b, 'msg.c@test.sn'), f = await inscrire(b, 'msg.f@test.sn'), tiers = await inscrire(b, 'msg.t@test.sn');
    const agent = await compteInterne(b, 'msg.agent@test.sn', 'agent'), admin = await compteInterne(b, 'msg.admin@test.sn', 'admin');
    await b.http().post('/declarations').set(auth(c)).send(D('MSG000777', DAKAR));
    await b.http().post('/signalements').set(auth(f)).send(S('MSG000777', THIES));
    const corr = await corrDe('MSG000777');

    expect((await b.http().get(`/correspondances/${corr}/messages`).set(auth(c))).status).toBe(403);
    expect((await b.http().post(`/correspondances/${corr}/messages`).set(auth(f)).send({ texte: 'Bonjour' })).status).toBe(403);

    await b.http().post(`/agent/correspondances/${corr}/valider`).set(auth(agent));
    await b.http().post(`/correspondances/${corr}/valider`).set(auth(c));
    await payer(b, corr, c);

    expect((await b.http().post(`/correspondances/${corr}/messages`).set(auth(tiers)).send({ texte: 'Je me glisse' })).status).toBe(403);
    expect((await b.http().post(`/correspondances/${corr}/messages`).set(auth(f)).send({ texte: '   ' })).status).toBe(400);
    expect((await b.http().post(`/correspondances/${corr}/messages`).set(auth(f)).send({ texte: 'Bonjour, je suis devant la gare.' })).status).toBe(201);
    expect((await b.http().post(`/correspondances/${corr}/messages`).set(auth(c)).send({ texte: "Merci, j'arrive." })).status).toBe(201);

    const vue = await b.http().get(`/correspondances/${corr}/messages`).set(auth(c));
    expect(vue.body.map((m: any) => m.moi)).toEqual([false, true]);
    const notifs = await b.pool.query(`SELECT 1 FROM notifications WHERE type = 'message'`);
    expect(notifs.rowCount).toBe(2);
    const j = await b.pool.query(`SELECT * FROM journal_actions WHERE action = 'message_envoye'`);
    expect(j.rowCount).toBe(2);
    expect(JSON.stringify(j.rows)).not.toContain('gare');

    await b.http().post(`/correspondances/${corr}/confirmer-remise`).set(auth(c));
    await b.http().post(`/correspondances/${corr}/confirmer-remise`).set(auth(f));
    expect((await b.http().post(`/admin/correspondances/${corr}/cloturer`).set(auth(admin))).status).toBe(201);
    expect((await b.pool.query('SELECT 1 FROM messages WHERE correspondance_id = $1', [corr])).rowCount).toBe(0);
    expect((await b.pool.query(`SELECT 1 FROM declarations WHERE numero = 'ANONYMISE' AND lat IS NOT NULL`)).rowCount).toBe(0);
    expect((await b.pool.query(`SELECT 1 FROM signalements WHERE numero = 'ANONYMISE' AND lat IS NOT NULL`)).rowCount).toBe(0);
  });
});

describe("compte, centre d'aide et accueil", () => {
  it('le mot de passe se change avec le bon mot de passe actuel', async () => {
    const t = await inscrire(b, 'mdp@test.sn');
    expect((await b.http().patch('/auth/mot-de-passe').set(auth(t)).send({ ancien: 'Mauvais1234', nouveau: 'NouveauMdp1' })).status).toBe(400);
    expect((await b.http().patch('/auth/mot-de-passe').set(auth(t)).send({ ancien: 'MotDePasse1', nouveau: 'court' })).status).toBe(400);
    expect((await b.http().patch('/auth/mot-de-passe').set(auth(t)).send({ ancien: 'MotDePasse1', nouveau: 'NouveauMdp1' })).status).toBe(200);
    expect((await b.http().post('/auth/connexion').send({ email: 'mdp@test.sn', motDePasse: 'MotDePasse1' })).status).toBe(401);
    expect((await b.http().post('/auth/connexion').send({ email: 'mdp@test.sn', motDePasse: 'NouveauMdp1' })).status).toBe(201);
  });

  it("les chiffres publics ne contiennent aucune donnée personnelle, le contact arrive chez l'administrateur", async () => {
    const pub = await b.http().get('/public/stats');
    expect(pub.status).toBe(200);
    expect(Object.keys(pub.body).sort()).toEqual(['declarations', 'recents', 'restitues', 'signalements']);
    expect(JSON.stringify(pub.body)).not.toMatch(/@|Diop|ANONYMISE/);

    expect((await b.http().post('/public/contact').send({ nom: 'A', email: 'pasunmail', sujet: 'x', message: 'court' })).status).toBe(400);
    const ok = await b.http().post('/public/contact').send({ nom: 'Visiteur', email: 'visiteur@test.sn', sujet: 'Question', message: 'Comment suivre ma déclaration ?' });
    expect(ok.status).toBe(201);
    const admin = await compteInterne(b, 'contact.admin@test.sn', 'admin');
    const l = await b.http().get('/admin/contacts').set(auth(admin));
    expect(l.body[0].sujet).toBe('Question');
    expect((await b.http().post(`/admin/contacts/${l.body[0].id}/traite`).set(auth(admin))).status).toBe(201);
    const citoyen = await inscrire(b, 'contact.c@test.sn');
    expect((await b.http().get('/admin/contacts').set(auth(citoyen))).status).toBe(403);
  });

  it("notifications : tout marquer lu, supprimer seulement les siennes ; chiffres du citoyen et de l'agent", async () => {
    const c = await inscrire(b, 'notif.c@test.sn'), f = await inscrire(b, 'notif.f@test.sn');
    await b.http().post('/declarations').set(auth(c)).send(D('NOT000888'));
    await b.http().post('/signalements').set(auth(f)).send(S('NOT000888'));
    const liste = async (t: string) => (await b.http().get('/notifications').set(auth(t))).body as any[];
    let l = await liste(c);
    expect(l.length).toBeGreaterThan(0);
    expect(l.some((n) => !n.lue)).toBe(true);
    expect((await b.http().post('/notifications/lues').set(auth(c))).status).toBe(201);
    l = await liste(c);
    expect(l.every((n) => n.lue)).toBe(true);

    const mienne = l[0].id;
    await b.http().delete(`/notifications/${mienne}`).set(auth(f));
    expect((await b.pool.query('SELECT 1 FROM notifications WHERE id = $1', [mienne])).rowCount).toBe(1);
    await b.http().delete(`/notifications/${mienne}`).set(auth(c));
    expect((await b.pool.query('SELECT 1 FROM notifications WHERE id = $1', [mienne])).rowCount).toBe(0);

    const st = await b.http().get('/citoyen/stats').set(auth(c));
    expect(st.body).toEqual({ declarations: 1, signalements: 0, en_cours: 1, restitues: 0 });
    const agent = await compteInterne(b, 'stat.agent@test.sn', 'agent');
    expect((await b.http().get('/agent/stats').set(auth(agent))).body.a_verifier).toBeGreaterThanOrEqual(1);
    expect((await b.http().get('/agent/stats').set(auth(c))).status).toBe(403);
  });
});
