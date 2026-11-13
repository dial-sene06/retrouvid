process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? 'postgres://retrouvid:retrouvid_dev@localhost:5432/retrouvid_test';
process.env.JWT_SECRET = 'secret-de-test-assez-long-123';
process.env.AUTH_LIMIT ??= '1000';
process.env.GEOCODE_PAUSE_MS ??= '0';
// La vérification du téléphone a son propre fichier (verification.spec.ts) : ailleurs, la connexion reste en une étape.
process.env.VERIF_TELEPHONE ??= 'non';
process.env.PAYDUNYA_MASTER_KEY = 'cle-maitre-de-test';
process.env.PAYDUNYA_PRIVATE_KEY = 'cle-privee-de-test';
process.env.PAYDUNYA_TOKEN = 'jeton-de-test';
process.env.PAYDUNYA_MODE = 'test';
process.env.APP_URL = 'https://app.exemple.sn';
process.env.API_PUBLIC_URL = 'https://api.exemple.sn';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { migrate } from '../src/db/migrate';
import { configurer } from '../src/main';
import { PaydunyaService } from '../src/paiements/paydunya.service';

/** Faux serveur PayDunya : garde les factures créées et laisse le test décider de leur statut. */
export class FauxPaydunya {
  factures = new Map<string, { montant: number; statut: string; custom: any; corps: any; entetes: any }>();
  appels: string[] = [];
  panne = false;
  refus = false;
  dernier = '';
  fetch = async (url: any, init: any): Promise<Response> => {
    this.appels.push(`${init.method} ${url}`);
    if (this.panne) throw new Error('réseau coupé');
    const rep = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
    if (this.refus) return rep({ response_code: '1001', response_text: 'Clés invalides' }, 200);
    if (String(url).endsWith('/create')) {
      const corps = JSON.parse(init.body);
      const jeton = `test_${this.factures.size + 1}_${Math.random().toString(36).slice(2, 8)}`;
      this.factures.set(jeton, { montant: corps.invoice.total_amount, statut: 'pending', custom: corps.custom_data, corps, entetes: init.headers });
      this.dernier = jeton;
      return rep({ response_code: '00', response_text: `https://app.paydunya.com/sandbox-checkout/invoice/${jeton}`, description: 'Checkout Invoice Created', token: jeton });
    }
    const jeton = decodeURIComponent(String(url).split('/confirm/')[1]);
    const f = this.factures.get(jeton);
    if (!f) return rep({ response_code: '1002', response_text: 'Invoice not found' }, 404);
    return rep({ response_code: '00', status: f.statut, invoice: { total_amount: f.montant, token: jeton }, custom_data: f.custom, mode: 'test' });
  };
  /** Simule le résultat côté PayDunya (l'utilisateur a payé, annulé…). */
  regler(statut: string, jeton = this.dernier) { this.factures.get(jeton)!.statut = statut; }
}

export interface Banc { app: INestApplication; pool: Pool; http: () => ReturnType<typeof request>; fermer: () => Promise<void>; paydunya: FauxPaydunya }

/** Démarre l'application sur une base de test vierge. */
export async function demarrer(): Promise<Banc> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(process.env.DATABASE_URL!);
  const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configurer(m.createNestApplication());
  await app.init();
  const paydunya = new FauxPaydunya();
  app.get(PaydunyaService).fetchImpl = paydunya.fetch as typeof fetch;
  return { app, pool, paydunya, http: () => request(app.getHttpServer()), fermer: async () => { await app.close(); await pool.end(); } };
}

/** Parcours complet côté citoyen : ouvre la facture, « paie » chez PayDunya, puis revient sur la page de retour. */
export async function payer(b: Banc, correspondanceId: string, jetonCitoyen: string) {
  const o = await b.http().post(`/correspondances/${correspondanceId}/payer`).set(auth(jetonCitoyen));
  expect(o.status).toBe(201);
  b.paydunya.regler('completed');
  const r = await b.http().get(`/correspondances/${correspondanceId}/paiement`).set(auth(jetonCitoyen));
  expect(r.body.statut).toBe('reussi');
  return r.body;
}

export const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

export async function inscrire(b: Banc, email: string, nom = 'Test') {
  const r = await b.http().post('/auth/inscription').send({ nom, prenom: 'Aminata', email, telephone: '771234567', motDePasse: 'MotDePasse1' });
  expect(r.status).toBe(201);
  return r.body.jeton as string;
}

export async function compteInterne(b: Banc, email: string, role: 'agent' | 'admin') {
  await b.pool.query(`INSERT INTO comptes (nom, prenom, email, telephone, mot_de_passe_hache, role) VALUES ('Int','Erne',$1,'770000000',$2,$3)`,
    [email, await hash('MotDePasse1', 4), role]);
  const r = await b.http().post('/auth/connexion').send({ email, motDePasse: 'MotDePasse1' });
  expect(r.status).toBe(201);
  return r.body.jeton as string;
}

export const decl = { typeDocument: 'cni', numero: '1 234 567 890 123', nomProprietaire: 'Awa Diop', dateNaissance: '1999-04-12', lieuPerte: 'Marché Sandaga, Dakar', datePerte: '2026-10-20' };
export const sig = { typeDocument: 'cni', numero: '1234567890123', nomSurDocument: 'DIOP AWA', dateNaissance: '1999-04-12', lieuTrouve: 'Gare routière Pompiers', dateTrouve: '2026-10-22' };
