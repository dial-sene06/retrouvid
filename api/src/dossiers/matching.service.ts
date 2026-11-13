import { Injectable } from '@nestjs/common';
import { normaliserNom, normaliserNumero } from '../common/mask';
import { DbService } from '../db/db.service';
import { NotificationsService } from '../notifications/notifications.module';

export const SEUIL = 40;

export function calculerScore(d: any, s: any): { score: number; champs: string[] } {
  const champs: string[] = [];
  let score = 0;
  if (normaliserNumero(d.numero) === normaliserNumero(s.numero)) { score += 50; champs.push('numero'); }
  if (normaliserNom(d.nom_proprietaire) === normaliserNom(s.nom_sur_document)) { score += 40; champs.push('nom'); }
  if (d.date_naissance && s.date_naissance && String(d.date_naissance) === String(s.date_naissance)) { score += 10; champs.push('date_naissance'); }
  return { score, champs };
}

@Injectable()
export class MatchingService {
  constructor(private db: DbService, private notif: NotificationsService) {}

  /** Rapproche une nouvelle déclaration des signalements encore ouverts. */
  async apresDeclaration(decl: any) {
    const candidats = await this.db.query(
      `SELECT * FROM signalements WHERE type_document = $1 AND etat IN ('en_attente','en_verification')`, [decl.type_document]);
    for (const s of candidats) await this.proposer(decl, s);
  }

  /** Rapproche un nouveau signalement des déclarations encore ouvertes. */
  async apresSignalement(sig: any) {
    const candidats = await this.db.query(
      `SELECT * FROM declarations WHERE type_document = $1 AND etat IN ('en_attente','en_verification')`, [sig.type_document]);
    for (const d of candidats) await this.proposer(d, sig);
  }

  private async proposer(d: any, s: any) {
    // une personne ne peut pas se rapprocher de son propre signalement
    if (d.compte_id === s.compte_id) return;
    const { score, champs } = calculerScore(d, s);
    if (score < SEUIL) return;
    const c = await this.db.one(
      `INSERT INTO correspondances (declaration_id, signalement_id, score, champs_concordants)
       VALUES ($1,$2,$3,$4) ON CONFLICT (declaration_id, signalement_id) DO NOTHING RETURNING id`,
      [d.id, s.id, score, champs]);
    if (!c) return;
    await this.db.query(`UPDATE declarations SET etat='en_verification' WHERE id=$1 AND etat='en_attente'`, [d.id]);
    await this.db.query(`UPDATE signalements SET etat='en_verification' WHERE id=$1 AND etat='en_attente'`, [s.id]);
    await this.notif.envoyer(d.compte_id, 'correspondance', 'Un document pourrait correspondre à votre déclaration. Un agent le vérifie.');
    const agents = await this.db.query(`SELECT id FROM comptes WHERE role='agent' AND actif`);
    for (const a of agents) await this.notif.envoyer(a.id, 'a_verifier', 'Une nouvelle correspondance attend votre vérification.');
  }
}
