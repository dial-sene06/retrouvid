import { BadRequestException, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { envoyerPhoto } from './declarations.controller';
import { CurrentUser, Roles, Utilisateur } from '../common/auth';
import { distanceKm, pointDe } from '../common/geo';
import { masquerNom, masquerNumero } from '../common/mask';
import { config } from '../config';
import { DbService } from '../db/db.service';
import { JournalService } from '../journal/journal.service';
import { NotificationsService } from '../notifications/notifications.module';
import { PaiementsService } from '../paiements/paiements.module';
import { PaydunyaService } from '../paiements/paydunya.service';

const BASE = `
  SELECT c.id, c.etat, c.score, c.champs_concordants, c.cree_le,
         d.id AS decl_id, d.compte_id AS citoyen_id, d.type_document, d.numero AS decl_numero, d.nom_proprietaire,
         d.date_naissance AS decl_naissance, d.lieu_perte, d.date_perte, d.lat AS decl_lat, d.lng AS decl_lng,
         s.id AS sig_id, s.compte_id AS decouvreur_id, s.numero AS sig_numero, s.nom_sur_document,
         s.date_naissance AS sig_naissance, s.lieu_trouve, s.date_trouve, s.description AS sig_description, s.lat AS sig_lat, s.lng AS sig_lng,
         r.confirmee_citoyen_le, r.confirmee_decouvreur_le, pa.statut AS paiement_statut,
         EXISTS(SELECT 1 FROM signalement_photos sp WHERE sp.signalement_id = s.id) AS sig_photo
  FROM correspondances c
  JOIN declarations d ON d.id = c.declaration_id
  JOIN signalements s ON s.id = c.signalement_id
  LEFT JOIN remises r ON r.correspondance_id = c.id
  LEFT JOIN paiements pa ON pa.correspondance_id = c.id`;

@Controller()
export class CorrespondancesController {
  constructor(private db: DbService, private journal: JournalService, private notif: NotificationsService,
    private paiements: PaiementsService, private paydunya: PaydunyaService) {}

  /** Distance à vol d'oiseau entre le lieu de perte et le lieu de découverte, quand les deux ont une position GPS. */
  private distance(c: any): number | null {
    const a = pointDe({ lat: c.decl_lat, lng: c.decl_lng }), b = pointDe({ lat: c.sig_lat, lng: c.sig_lng });
    return a && b ? distanceKm(a, b) : null;
  }

  private async charger(id: string) {
    const c = await this.db.one(`${BASE} WHERE c.id = $1`, [id]);
    if (!c) throw new NotFoundException('Correspondance introuvable');
    return c;
  }

  // ---- Agent : il compare des valeurs partiellement masquées et ne fait que valider ou écarter ----
  @Get('agent/correspondances') @Roles('agent')
  async fileAgent() {
    const l = await this.db.query(`${BASE} WHERE c.etat = 'en_verification' ORDER BY c.score DESC, c.cree_le`);
    return l.map((c) => ({
      id: c.id, score: c.score, type_document: c.type_document, champs_concordants: c.champs_concordants,
      distance_km: this.distance(c),
      declaration: { numero: masquerNumero(c.decl_numero), nom: masquerNom(c.nom_proprietaire), date_naissance: c.decl_naissance, lieu: c.lieu_perte, date: c.date_perte, lat: c.decl_lat, lng: c.decl_lng },
      signalement: { numero: masquerNumero(c.sig_numero), nom: masquerNom(c.nom_sur_document), date_naissance: c.sig_naissance, lieu: c.lieu_trouve, date: c.date_trouve, lat: c.sig_lat, lng: c.sig_lng, a_photo: c.sig_photo },
    }));
  }

  /** La photo montre le document en clair : seul l'agent chargé de la vérification la voit, et chaque ouverture est journalisée. */
  @Get('agent/correspondances/:id/photo') @Roles('agent')
  async photoAgent(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const c = await this.charger(id);
    if (c.etat !== 'en_verification') throw new BadRequestException("La photo n'est consultable que pendant la vérification");
    const p = await this.db.one('SELECT type_mime, donnees FROM signalement_photos WHERE signalement_id = $1', [c.sig_id]);
    if (!p) throw new NotFoundException('Aucune photo pour ce signalement');
    await this.journal.ajouter(u.id, 'consultation_photo', 'signalement', c.sig_id);
    envoyerPhoto(res, p);
  }

  @Post('agent/correspondances/:id/valider') @Roles('agent')
  async valider(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.charger(id);
    if (c.etat !== 'en_verification') throw new BadRequestException('Cette correspondance a déjà été traitée');
    await this.db.query(`UPDATE correspondances SET etat='validee_agent', validation_agent_par=$2, validation_agent_le=now() WHERE id=$1`, [id, u.id]);
    await this.journal.ajouter(u.id, 'correspondance_validee_agent', 'correspondance', id);
    await this.notif.envoyer(c.citoyen_id, 'a_valider', 'Un agent a vérifié la correspondance. Confirmez à votre tour pour continuer.');
    return { ok: true, etat: 'validee_agent' };
  }

  @Post('agent/correspondances/:id/ecarter') @Roles('agent')
  async ecarter(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.charger(id);
    if (c.etat !== 'en_verification') throw new BadRequestException('Cette correspondance a déjà été traitée');
    await this.db.tx(async (t) => {
      await t.query(`UPDATE correspondances SET etat='ecartee', validation_agent_par=$2, validation_agent_le=now() WHERE id=$1`, [id, u.id]);
      // le dossier reste en attente tant qu'aucune autre correspondance n'est en cours
      await t.query(`UPDATE declarations SET etat='en_attente' WHERE id=$1 AND etat='en_verification'
        AND NOT EXISTS (SELECT 1 FROM correspondances WHERE declaration_id=$1 AND etat NOT IN ('ecartee','cloturee'))`, [c.decl_id]);
      await t.query(`UPDATE signalements SET etat='en_attente' WHERE id=$1 AND etat='en_verification'
        AND NOT EXISTS (SELECT 1 FROM correspondances WHERE signalement_id=$1 AND etat NOT IN ('ecartee','cloturee'))`, [c.sig_id]);
    });
    await this.journal.ajouter(u.id, 'correspondance_ecartee', 'correspondance', id);
    return { ok: true, etat: 'ecartee' };
  }

  // ---- Utilisateur : une même personne peut avoir perdu un document et en avoir trouvé un autre ----
  // « perte » = je suis propriétaire de la déclaration ; « trouvaille » = j'ai signalé le document.
  @Get('correspondances') @Roles('citoyen')
  async mes(@CurrentUser() u: Utilisateur) {
    const l = await this.db.query(
      `${BASE} WHERE (d.compte_id = $1 OR s.compte_id = $1) AND c.etat NOT IN ('ecartee') ORDER BY c.cree_le DESC`, [u.id]);
    return l.map((c) => (c.citoyen_id === u.id ? { cote: 'perte', ...this.vueCitoyen(c) } : { cote: 'trouvaille', ...this.vueDecouvreur(c) }));
  }

  private vueCitoyen(c: any) {
    const apresAgent = c.etat !== 'en_verification';
    return {
      id: c.id, etat: c.etat, type_document: c.type_document, numero: masquerNumero(c.decl_numero),
      signalement: apresAgent ? { lieu_trouve: c.lieu_trouve, date_trouve: c.date_trouve, description: c.sig_description, lat: c.sig_lat, lng: c.sig_lng } : null,
      distance_km: apresAgent ? this.distance(c) : null,
      messagerie_ouverte: ['payee', 'remise'].includes(c.etat),
      peut_valider: c.etat === 'validee_agent',
      peut_payer: c.etat === 'validee_citoyen',
      paiement_disponible: this.paydunya.actif(),
      paiement_statut: c.paiement_statut ?? 'aucun',
      montant: config.montantCoordonnees,
      coordonnees_disponibles: ['payee', 'remise', 'cloturee'].includes(c.etat),
      remise_confirmee_par_moi: !!c.confirmee_citoyen_le,
      peut_confirmer_remise: c.etat === 'payee' && !c.confirmee_citoyen_le,
    };
  }
  private vueDecouvreur(c: any) {
    return {
      id: c.id, etat: c.etat, type_document: c.type_document, lieu_trouve: c.lieu_trouve, date_trouve: c.date_trouve,
      messagerie_ouverte: ['payee', 'remise'].includes(c.etat),
      remise_confirmee_par_moi: !!c.confirmee_decouvreur_le,
      peut_confirmer_remise: c.etat === 'payee' && !c.confirmee_decouvreur_le,
    };
  }

  /** Charge la correspondance et vérifie que l'utilisateur y a le côté demandé (perte ou trouvaille). */
  private async cote(u: Utilisateur, id: string, attendu?: 'perte' | 'trouvaille') {
    const c = await this.charger(id);
    const reel = c.citoyen_id === u.id ? 'perte' : c.decouvreur_id === u.id ? 'trouvaille' : null;
    if (!reel || (attendu && reel !== attendu)) throw new ForbiddenException('Cette correspondance ne vous concerne pas');
    return { c, cote: reel as 'perte' | 'trouvaille' };
  }

  @Post('correspondances/:id/valider') @Roles('citoyen')
  async validerCitoyen(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string) {
    const { c } = await this.cote(u, id, 'perte');
    if (c.etat !== 'validee_agent') throw new BadRequestException("La vérification par l'agent est nécessaire avant votre confirmation");
    await this.db.query(`UPDATE correspondances SET etat='validee_citoyen', validation_citoyen_le=now() WHERE id=$1`, [id]);
    await this.journal.ajouter(u.id, 'correspondance_validee_citoyen', 'correspondance', id);
    return { ok: true, etat: 'validee_citoyen' };
  }

  /**
   * Ouvre le paiement PayDunya (Wave, Orange Money). Les deux validations sont requises ; l'état « payee »
   * n'est posé qu'après confirmation de PayDunya, jamais sur la foi du navigateur.
   */
  @Post('correspondances/:id/payer') @Roles('citoyen')
  async payer(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string) {
    const { c } = await this.cote(u, id, 'perte');
    if (c.etat !== 'validee_citoyen') throw new BadRequestException("Le paiement n'est possible qu'après la validation de l'agent puis la vôtre");
    return { ok: true, ...(await this.paiements.initier(id, u.id)) };
  }

  /** Appelée au retour de PayDunya : vérifie auprès de PayDunya où en est le paiement, puis applique le résultat. */
  @Get('correspondances/:id/paiement') @Roles('citoyen')
  async etatPaiement(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string) {
    await this.cote(u, id, 'perte');
    const p = await this.db.one('SELECT jeton, statut FROM paiements WHERE correspondance_id = $1', [id]);
    let statut = (p?.statut ?? 'aucun') as string;
    if (p?.statut === 'en_attente' && p.jeton) statut = await this.paiements.finaliser(p.jeton);
    const c = await this.charger(id);
    return { statut, etat: c.etat };
  }

  @Get('correspondances/:id/coordonnees') @Roles('citoyen')
  async coordonnees(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string) {
    const { c } = await this.cote(u, id, 'perte');
    if (!['payee', 'remise', 'cloturee'].includes(c.etat)) throw new ForbiddenException('Les coordonnées sont disponibles après paiement');
    const f = await this.db.one('SELECT nom, prenom, telephone, email FROM comptes WHERE id = $1', [c.decouvreur_id]);
    await this.journal.ajouter(u.id, 'consultation_coordonnees', 'correspondance', id);
    return f;
  }

  @Post('correspondances/:id/confirmer-remise') @Roles('citoyen')
  async confirmerRemise(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string) {
    const { c, cote } = await this.cote(u, id);
    if (c.etat !== 'payee') throw new BadRequestException("La remise se confirme une fois les coordonnées transmises");
    const colonne = cote === 'perte' ? 'confirmee_citoyen_le' : 'confirmee_decouvreur_le';
    const r = await this.db.tx(async (t) => {
      const res = await t.query(`UPDATE remises SET ${colonne} = COALESCE(${colonne}, now()) WHERE correspondance_id = $1
        RETURNING confirmee_citoyen_le, confirmee_decouvreur_le`, [id]);
      const x = res.rows[0];
      const complete = !!(x.confirmee_citoyen_le && x.confirmee_decouvreur_le);
      if (complete) {
        await t.query(`UPDATE remises SET cloturee_le = now() WHERE correspondance_id = $1`, [id]);
        await t.query(`UPDATE correspondances SET etat='remise' WHERE id=$1`, [id]);
        await t.query(`UPDATE declarations SET etat='remis' WHERE id=$1`, [c.decl_id]);
        await t.query(`UPDATE signalements SET etat='remis' WHERE id=$1`, [c.sig_id]);
      }
      return complete;
    });
    await this.journal.ajouter(u.id, 'remise_confirmee', 'correspondance', id, { complete: r });
    const autre = cote === 'perte' ? c.decouvreur_id : c.citoyen_id;
    await this.notif.envoyer(autre, 'remise', r ? 'La remise du document est confirmée par les deux parties.' : "L'autre partie a confirmé la remise. À vous de confirmer.");
    return { ok: true, remise_complete: r };
  }
}
