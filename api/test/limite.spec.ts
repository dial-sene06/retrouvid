// Limitation du débit des routes d'authentification (ENF), sur une application neuve.
process.env.AUTH_LIMIT = '10';

import { Banc, demarrer } from './aide';

let b: Banc;
beforeAll(async () => { b = await demarrer(); });
afterAll(async () => { await b.fermer(); });

it('le dixième essai de connexion en une minute passe, le onzième est limité (429)', async () => {
  const statuts: number[] = [];
  for (let i = 0; i < 12; i++) statuts.push((await b.http().post('/auth/connexion').send({ email: 'inconnu@test.sn', motDePasse: 'MauvaisMdp1' })).status);
  expect(statuts.slice(0, 10).every((x) => x === 401)).toBe(true);
  expect(statuts.slice(10)).toEqual([429, 429]);
});
