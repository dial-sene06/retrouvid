import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config';

export interface IdentiteGoogle { sub: string; email: string; emailVerifie: boolean; prenom: string; nom: string }

/** Vérifie le jeton d'identité Google côté serveur : signature, expiration et audience (notre identifiant client). */
@Injectable()
export class GoogleVerifier {
  private client = new OAuth2Client();

  async verifier(credential: string): Promise<IdentiteGoogle> {
    const audience = config.googleClientId();
    if (!audience) throw new ServiceUnavailableException("La connexion avec Google n'est pas activée sur ce serveur");
    try {
      const t = await this.client.verifyIdToken({ idToken: credential, audience });
      const p = t.getPayload();
      if (!p?.sub || !p.email) throw new Error('jeton incomplet');
      return { sub: p.sub, email: p.email, emailVerifie: p.email_verified === true, prenom: p.given_name ?? '', nom: p.family_name ?? '' };
    } catch {
      throw new UnauthorizedException('Jeton Google invalide ou expiré');
    }
  }
}
