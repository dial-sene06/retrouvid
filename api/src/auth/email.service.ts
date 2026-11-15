import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';

/**
 * Envoi d'e-mails transactionnels par l'API de Brevo. Aucun e-mail n'est simulé : sans clé configurée,
 * l'envoi est indisponible et l'appelant le dit à l'utilisateur.
 */
@Injectable()
export class EmailService {
  private log = new Logger('E-mail');
  /** Remplaçable dans les tests, comme pour PayDunya. */
  fetchImpl: typeof fetch = (...a) => fetch(...a);

  configure() { return config.email.configure(); }

  /** Renvoie true si Brevo a accepté l'e-mail. Ne lève jamais : un échec d'envoi ne doit pas faire tomber la requête. */
  async envoyer(destinataire: string, sujet: string, texte: string, html: string): Promise<boolean> {
    if (!this.configure()) return false;
    try {
      const r = await this.fetchImpl('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': config.email.cleBrevo(), 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: config.email.nomExpediteur(), email: config.email.expediteur() },
          to: [{ email: destinataire }],
          subject: sujet, textContent: texte, htmlContent: html,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) { this.log.warn(`Brevo a refusé l'e-mail (HTTP ${r.status})`); return false; }
      return true;
    } catch (e: any) {
      this.log.warn(`Brevo injoignable : ${e?.message ?? e}`);
      return false;
    }
  }
}
