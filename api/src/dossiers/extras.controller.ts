import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, Length } from 'class-validator';
import { CurrentUser, Roles, Utilisateur } from '../common/auth';
import { DbService } from '../db/db.service';
import { JournalService } from '../journal/journal.service';
import { NotificationsService } from '../notifications/notifications.module';

class MessageDto { @IsString() @Length(1, 500) texte: string; }

/** Discussion et chiffres personnels des acteurs. */
@Controller()
export class ExtrasController {
  constructor(private db: DbService, private journal: JournalService, private notif: NotificationsService) {}

  // ---- Chiffres personnels (carte de bienvenue du citoyen, bandeau de l'agent) ----
  @Get('citoyen/stats') @Roles('citoyen')
  stats(@CurrentUser() u: Utilisateur) {
    return this.db.one(`SELECT
      (SELECT count(*) FROM declarations WHERE compte_id = $1)::int AS declarations,
      (SELECT count(*) FROM signalements WHERE compte_id = $1)::int AS signalements,
      (SELECT count(*) FROM correspondances c JOIN declarations d ON d.id = c.declaration_id JOIN signalements s ON s.id = c.signalement_id
        WHERE (d.compte_id = $1 OR s.compte_id = $1) AND c.etat IN ('en_verification','validee_agent','validee_citoyen','payee'))::int AS en_cours,
      (SELECT count(*) FROM correspondances c JOIN declarations d ON d.id = c.declaration_id JOIN signalements s ON s.id = c.signalement_id
        WHERE (d.compte_id = $1 OR s.compte_id = $1) AND c.etat IN ('remise','cloturee'))::int AS restitues`, [u.id]);
  }

  @Get('agent/stats') @Roles('agent')
  statsAgent(@CurrentUser() u: Utilisateur) {
    return this.db.one(`SELECT
      (SELECT count(*) FROM correspondances WHERE etat = 'en_verification')::int AS a_verifier,
      (SELECT count(*) FROM correspondances WHERE validation_agent_par = $1 AND etat <> 'ecartee')::int AS validees,
      (SELECT count(*) FROM correspondances WHERE validation_agent_par = $1 AND etat = 'ecartee')::int AS ecartees`, [u.id]);
  }

  // ---- Discussion : ouverte seulement quand le propriétaire a payé, donc que les coordonnées sont déjà transmises ----
  private async partie(u: Utilisateur, id: string) {
    const c = await this.db.one(
      `SELECT c.id, c.etat, d.compte_id AS citoyen_id, s.compte_id AS decouvreur_id
       FROM correspondances c JOIN declarations d ON d.id = c.declaration_id JOIN signalements s ON s.id = c.signalement_id WHERE c.id = $1`, [id]);
    if (!c) throw new NotFoundException('Correspondance introuvable');
    if (c.citoyen_id !== u.id && c.decouvreur_id !== u.id) throw new ForbiddenException('Cette correspondance ne vous concerne pas');
    return c;
  }
  private ouverte(etat: string) {
    if (!['payee', 'remise'].includes(etat)) throw new ForbiddenException('La discussion s’ouvre une fois les coordonnées transmises');
  }

  @Get('correspondances/:id/messages') @Roles('citoyen')
  async messages(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.partie(u, id); this.ouverte(c.etat);
    return this.db.query(`SELECT id, texte, cree_le, (auteur_id = $2) AS moi FROM messages WHERE correspondance_id = $1 ORDER BY cree_le LIMIT 200`, [id, u.id]);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } }) @Post('correspondances/:id/messages') @Roles('citoyen')
  async envoyer(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string, @Body() d: MessageDto) {
    const c = await this.partie(u, id); this.ouverte(c.etat);
    const texte = d.texte.trim();
    if (!texte) throw new BadRequestException('Message vide');
    const m = await this.db.one('INSERT INTO messages (correspondance_id, auteur_id, texte) VALUES ($1,$2,$3) RETURNING id, texte, cree_le, true AS moi', [id, u.id, texte]);
    await this.journal.ajouter(u.id, 'message_envoye', 'correspondance', id); // le contenu n'est jamais journalisé
    await this.notif.envoyer(c.citoyen_id === u.id ? c.decouvreur_id : c.citoyen_id, 'message', 'Nouveau message au sujet de la restitution du document.');
    return m;
  }
}
