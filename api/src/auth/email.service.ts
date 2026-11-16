import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { config } from '../config';

/** Ce qu'il faut d'un transport SMTP : envoyer un message. Remplaçable dans les tests. */
export interface TransportSmtp { sendMail(m: { from: string; to: string; subject: string; text: string; html: string }): Promise<unknown> }

/**
 * Envoi d'e-mails transactionnels. Deux voies, essayées dans cet ordre :
 * 1. SMTP (Gmail par défaut) si SMTP_UTILISATEUR et SMTP_MOT_DE_PASSE sont renseignés ;
 * 2. l'API de Brevo si BREVO_API_KEY et EMAIL_EXPEDITEUR le sont.
 * Aucun e-mail n'est simulé : sans configuration, l'envoi est indisponible et l'appelant le dit à l'utilisateur.
 */
@Injectable()
export class EmailService {
  private log = new Logger('E-mail');
  /** Remplaçables dans les tests, comme pour PayDunya. */
  fetchImpl: typeof fetch = (...a) => fetch(...a);
  transportImpl: (() => TransportSmtp) | null = null;
  private transport: Transporter | null = null;

  configure() { return config.email.configure(); }

  private smtp(): TransportSmtp {
    if (this.transportImpl) return this.transportImpl();
    // un seul transport par instance : la connexion sécurisée (port 465) est réutilisée d'un envoi à l'autre
    this.transport ??= createTransport({
      host: config.email.smtp.hote(), port: config.email.smtp.port(), secure: config.email.smtp.port() === 465,
      auth: { user: config.email.smtp.utilisateur(), pass: config.email.smtp.motDePasse() },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    });
    return this.transport;
  }

  /** Renvoie true si l'e-mail a été accepté. Ne lève jamais : un échec d'envoi ne doit pas faire tomber la requête. */
  async envoyer(destinataire: string, sujet: string, texte: string, html: string): Promise<boolean> {
    if (!this.configure()) return false;
    if (config.email.smtp.configure()) return this.parSmtp(destinataire, sujet, texte, html);
    return this.parBrevo(destinataire, sujet, texte, html);
  }

  private async parSmtp(destinataire: string, sujet: string, texte: string, html: string) {
    try {
      const nom = config.email.nomExpediteur().replace(/["\\]/g, '');
      await this.smtp().sendMail({ from: `"${nom}" <${config.email.expediteur()}>`, to: destinataire, subject: sujet, text: texte, html });
      return true;
    } catch (e: any) {
      // on n'écrit que le code de réponse : jamais d'identifiant
      this.log.warn(`Envoi SMTP refusé : ${e?.responseCode ?? ''} ${e?.code ?? 'erreur'}`);
      return false;
    }
  }

  private async parBrevo(destinataire: string, sujet: string, texte: string, html: string) {
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
