import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { config } from '../config';

export type StatutFacture = 'completed' | 'pending' | 'cancelled' | 'failed';
export interface Facture { jeton: string; url: string }
export interface Confirmation { statut: StatutFacture; montant: number | null; correspondanceId: string | null }

/** Les pages de paiement ne sont acceptées que si elles sont hébergées par PayDunya (pas de redirection libre). */
const HOTE_PAIEMENT = /^https:\/\/([a-z0-9-]+\.)*paydunya\.com\//;

/**
 * Client minimal de l'API « checkout-invoice » de PayDunya.
 * Les clés restent sur le serveur ; le navigateur reçoit seulement l'adresse de la page de paiement.
 */
@Injectable()
export class PaydunyaService {
  private log = new Logger('PayDunya');
  /** Remplaçable en test : aucun appel réseau réel n'est fait par la suite de tests. */
  fetchImpl: typeof fetch = (...a) => fetch(...a);

  actif() { return config.paydunya.configure(); }

  private racine() {
    return `https://app.paydunya.com/${config.paydunya.mode() === 'live' ? 'api' : 'sandbox-api'}/v1/checkout-invoice`;
  }

  private entetes() {
    return {
      'Content-Type': 'application/json',
      'PAYDUNYA-MASTER-KEY': config.paydunya.cleMaitre(),
      'PAYDUNYA-PRIVATE-KEY': config.paydunya.clePrivee(),
      'PAYDUNYA-TOKEN': config.paydunya.jeton(),
    };
  }

  private async appeler(url: string, init: RequestInit): Promise<any> {
    if (!this.actif()) throw new ServiceUnavailableException("Le paiement en ligne n'est pas encore activé sur ce serveur");
    let r: Response;
    try {
      r = await this.fetchImpl(url, { ...init, headers: this.entetes(), signal: AbortSignal.timeout(10000) });
    } catch (e) {
      this.log.error(`appel impossible : ${(e as Error).message}`);
      throw new BadGatewayException('Le service de paiement ne répond pas, réessayez dans un instant');
    }
    let corps: any = null;
    try { corps = await r.json(); } catch { /* corps non JSON */ }
    if (!r.ok || !corps) {
      this.log.error(`réponse inattendue (HTTP ${r.status})`);
      throw new BadGatewayException('Le service de paiement a refusé la demande');
    }
    return corps;
  }

  async creerFacture(p: { montant: number; description: string; correspondanceId: string; retour: string; annulation: string; rappel?: string }): Promise<Facture> {
    const canaux = config.paydunya.canaux();
    const corps = await this.appeler(`${this.racine()}/create`, {
      method: 'POST',
      body: JSON.stringify({
        invoice: { total_amount: p.montant, description: p.description, ...(canaux.length ? { channels: canaux } : {}) },
        store: { name: 'RetrouvID', tagline: "Retrouver une pièce d'identité perdue" },
        actions: { return_url: p.retour, cancel_url: p.annulation, ...(p.rappel ? { callback_url: p.rappel } : {}) },
        custom_data: { correspondance_id: p.correspondanceId },
      }),
    });
    const jeton = typeof corps.token === 'string' ? corps.token : '';
    if (corps.response_code !== '00' || !jeton) {
      this.log.error(`création refusée : code ${corps.response_code}`);
      throw new BadGatewayException('Le service de paiement a refusé la demande');
    }
    // PayDunya place l'adresse de la page de paiement dans response_text. On ne la devine jamais.
    const url = typeof corps.response_text === 'string' ? corps.response_text.trim() : '';
    if (!HOTE_PAIEMENT.test(url)) {
      this.log.error(`adresse de paiement absente ou étrangère à PayDunya : ${String(corps.response_text).slice(0, 200)}`);
      throw new BadGatewayException('Le service de paiement a refusé la demande');
    }
    return { jeton, url };
  }

  /** Interroge PayDunya : c'est cette réponse, et elle seule, qui prouve qu'un paiement a abouti. */
  async confirmer(jeton: string): Promise<Confirmation> {
    const corps = await this.appeler(`${this.racine()}/confirm/${encodeURIComponent(jeton)}`, { method: 'GET' });
    if (corps.response_code !== '00') throw new BadGatewayException('Le service de paiement ne reconnaît pas cette transaction');
    const brut = String(corps.status ?? '').toLowerCase();
    const statut: StatutFacture = brut === 'completed' ? 'completed' : brut === 'pending' ? 'pending'
      : brut === 'cancelled' || brut === 'canceled' ? 'cancelled' : 'failed';
    const m = Number(corps.invoice?.total_amount);
    return { statut, montant: Number.isFinite(m) ? m : null, correspondanceId: corps.custom_data?.correspondance_id ?? null };
  }

  /** La notification PayDunya porte le SHA-512 de la clé maître : on le compare en temps constant. */
  hashValide(recu: unknown): boolean {
    if (typeof recu !== 'string' || !config.paydunya.cleMaitre()) return false;
    const attendu = createHash('sha512').update(config.paydunya.cleMaitre()).digest('hex');
    const a = Buffer.from(recu.toLowerCase()), b = Buffer.from(attendu);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
