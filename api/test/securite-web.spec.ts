import { Banc, demarrer } from './aide';

describe('HTTPS, anti-spam et preuve des CGU', () => {
  let b: Banc;
  beforeAll(async () => { b = await demarrer(); });
  afterAll(async () => { await b.fermer(); });

  it('envoie les en-têtes de sécurité usuels', async () => {
    const r = await b.http().get('/public/stats');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['content-security-policy']).toBeDefined();
  });

  it('ignore le message du formulaire de contact quand le champ piège est rempli', async () => {
    const av = (await b.pool.query('SELECT count(*)::int n FROM contacts')).rows[0].n;
    const r = await b.http().post('/public/contact').send({ nom: 'Robot', email: 'r@exemple.sn', sujet: 'Promo', message: 'Achetez maintenant mon produit', siteWeb: 'http://spam.example' });
    expect(r.status).toBe(201);
    expect((await b.pool.query('SELECT count(*)::int n FROM contacts')).rows[0].n).toBe(av);
  });

  it('refuse une inscription dont le champ piège est rempli', async () => {
    const r = await b.http().post('/auth/inscription').send({ nom: 'Robot', prenom: 'Bot', email: 'bot@exemple.sn', telephone: '771112233', motDePasse: 'Demo12345', siteWeb: 'x' });
    expect(r.status).toBe(400);
    expect((await b.pool.query("SELECT count(*)::int n FROM comptes WHERE email='bot@exemple.sn'")).rows[0].n).toBe(0);
  });

  it("conserve la date d'acceptation des conditions seulement si la case est cochée", async () => {
    await b.http().post('/auth/inscription').send({ nom: 'Avec', prenom: 'Cgu', email: 'avec@exemple.sn', telephone: '771112244', motDePasse: 'Demo12345', accepteCgu: true }).expect(201);
    await b.http().post('/auth/inscription').send({ nom: 'Sans', prenom: 'Cgu', email: 'sans@exemple.sn', telephone: '771112255', motDePasse: 'Demo12345' }).expect(201);
    const l = (await b.pool.query("SELECT email, cgu_acceptees_le FROM comptes WHERE email IN ('avec@exemple.sn','sans@exemple.sn')")).rows;
    expect(l.find((x) => x.email === 'avec@exemple.sn').cgu_acceptees_le).not.toBeNull();
    expect(l.find((x) => x.email === 'sans@exemple.sn').cgu_acceptees_le).toBeNull();
  });

  it('valide le formulaire de contact côté serveur', async () => {
    await b.http().post('/public/contact').send({ nom: 'A', email: 'pas-un-mail', sujet: '', message: 'court' }).expect(400);
  });
});

describe('redirection https', () => {
  const OLD = process.env.FORCE_HTTPS;
  afterEach(() => { if (OLD === undefined) delete process.env.FORCE_HTTPS; else process.env.FORCE_HTTPS = OLD; });

  it('redirige vers https quand FORCE_HTTPS est actif et laisse passer le trafic déjà sécurisé', async () => {
    process.env.FORCE_HTTPS = 'true'; process.env.CORS_ORIGIN = 'https://retrouvid.exemple';
    const b = await demarrer();
    try {
      const r = await b.http().get('/public/stats?x=1').set('Host', 'api.retrouvid.exemple').redirects(0);
      expect(r.status).toBe(308);
      expect(r.headers.location).toBe('https://api.retrouvid.exemple/public/stats?x=1');
      const ok = await b.http().get('/public/stats').set('X-Forwarded-Proto', 'https');
      expect(ok.status).toBe(200);
      expect(ok.headers['strict-transport-security']).toContain('max-age=31536000');
    } finally { delete process.env.CORS_ORIGIN; await b.fermer(); }
  });

  it("refuse de démarrer avec une origine CORS en http hors localhost quand https est forcé", async () => {
    process.env.FORCE_HTTPS = 'true'; process.env.CORS_ORIGIN = 'http://retrouvid.exemple';
    await expect(demarrer()).rejects.toThrow(/https/);
    delete process.env.CORS_ORIGIN;
  });
});
