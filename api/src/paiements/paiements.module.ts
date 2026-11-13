import { BadRequestException, Body, Controller, HttpCode, Injectable, Logger, Module, Post, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Public } from '../common/auth';
import { config } from '../config';
import { DbService } from '../db/db.service';
import { JournalService } from '../journal/journal.service';
import { NotificationsService } from '../notifications/notifications.module';
import { PaydunyaService } from './paydunya.service';

export type StatutPaiement = 'aucun' | 'en_attente' | 'reussi' | 'echoue' | 'annule';

@Injectable()
export class PaiementsService {
  private log = new Logger('Paiements');
  constructor(private db: DbService, private journal: JournalService, private notif: NotificationsService, private paydunya: PaydunyaService) {}

  /**
   * Crée (ou retrouve) la facture PayDunya d'une correspondance validée par l'agent puis par le citoyen.
   * Le montant vient du serveur ; le navigateur n'envoie rien. Un verrou par correspondance évite deux factures simultanées.
   */
  async initier(correspondanceId: string, compteId: string): Promise<{ url: string; montant: number }> {
    if (!this.paydunya.actif()) throw new ServiceUnavailableException("Le paiement en ligne n'est pas encore activé sur ce serveur");
    let dejaPaye: string | null = null;
    const url = await this.db.tx(async (t) => {
      await t.query('SELECT pg_advisory_xact_lock(hashtext($1))', [correspondanceId]);
      const p = (await t.query('SELECT id, statut, jeton, url_paiement FROM paiements WHERE correspondance_id = $1', [correspondanceId])).rows[0];
      if (p && ['reussi', 'simule'].includes(p.statut)) throw new BadRequestException('Cette correspondance est déjà payée');
      if (p?.statut === 'en_attente' && p.jeton && p.url_paiement) {
        // une facture est déjà ouverte : on la réutilise tant que PayDunya la juge valable
        const c = await this.paydunya.confirmer(p.jeton);
        if (c.statut === 'pending') return p.url_paiement as string;
        if (c.statut === 'completed') { dejaPaye = p.jeton; return null; }
      }
      const f = await this.paydunya.creerFacture({
        montant: config.montantCoordonnees,
        description: 'Coordonnées de la personne qui a trouvé votre document',
        correspondanceId,
        retour: `${config.urlApplication()}/paiement/retour/${correspondanceId}`,
        annulation: `${config.urlApplication()}/paiement/retour/${correspondanceId}?annule=1`,
        rappel: config.urlApiPublique() ? `${config.urlApiPublique()}/paiements/paydunya/ipn` : undefined,
      });
      const ref = 'RID-' + randomBytes(4).toString('hex').toUpperCase();
      await t.query(
        `INSERT INTO paiements (correspondance_id, compte_id, montant, statut, reference, fournisseur, jeton, url_paiement)
         VALUES ($1,$2,$3,'en_attente',$4,'paydunya',$5,$6)
         ON CONFLICT (correspondance_id) DO UPDATE SET statut='en_attente', reference=$4, jeton=$5, url_paiement=$6, maj_le=now()`,
        [correspondanceId, compteId, config.montantCoordonnees, ref, f.jeton, f.url]);
      return f.url;
    });
    if (url === null && dejaPaye) {
      // le paiement avait abouti sans que nous le sachions (notification perdue) : on l'enregistre maintenant
      await this.finaliser(dejaPaye);
      throw new BadRequestException('Ce paiement a déjà abouti : actualisez la page');
    }
    await this.journal.ajouter(compteId, 'paiement_initie', 'correspondance', correspondanceId, { montant: config.montantCoordonnees, mode: config.paydunya.mode() });
    return { url: url as string, montant: config.montantCoordonnees };
  }

  /**
   * Interroge PayDunya pour un jeton et applique le résultat. Appelée par la notification (IPN) et par la page de retour :
   * les deux chemins sont équivalents et sans danger si on les rejoue.
   */
  async finaliser(jeton: string): Promise<StatutPaiement> {
    const p = await this.db.one('SELECT id, correspondance_id, compte_id, montant, statut FROM paiements WHERE jeton = $1', [jeton]);
    if (!p) return 'aucun';
    if (p.statut === 'reussi') return 'reussi';
    const c = await this.paydunya.confirmer(jeton);

    if (c.statut === 'completed') {
      if (c.montant !== p.montant || (c.correspondanceId && c.correspondanceId !== p.correspondance_id)) {
        this.log.error(`paiement ${p.id} incohérent : montant reçu ${c.montant}, attendu ${p.montant}`);
        await this.db.query(`UPDATE paiements SET statut='echoue', maj_le=now() WHERE id=$1 AND statut='en_attente'`, [p.id]);
        await this.journal.ajouter(p.compte_id, 'paiement_incoherent', 'correspondance', p.correspondance_id);
        return 'echoue';
      }
      const neuf = await this.db.tx(async (t) => {
        const maj = await t.query(`UPDATE paiements SET statut='reussi', maj_le=now() WHERE id=$1 AND statut <> 'reussi'`, [p.id]);
        if (!maj.rowCount) return false;
        await t.query(`UPDATE correspondances SET etat='payee' WHERE id=$1 AND etat='validee_citoyen'`, [p.correspondance_id]);
        await t.query('INSERT INTO remises (correspondance_id) VALUES ($1) ON CONFLICT DO NOTHING', [p.correspondance_id]);
        return true;
      });
      if (neuf) {
        const d = await this.db.one('SELECT s.compte_id AS decouvreur FROM correspondances c JOIN signalements s ON s.id = c.signalement_id WHERE c.id = $1', [p.correspondance_id]);
        await this.journal.ajouter(p.compte_id, 'paiement_reussi', 'correspondance', p.correspondance_id, { montant: p.montant, mode: config.paydunya.mode() });
        if (d) await this.notif.envoyer(d.decouvreur, 'coordonnees', 'Le propriétaire du document a obtenu vos coordonnées et va vous contacter.');
      }
      return 'reussi';
    }
    if (c.statut === 'cancelled' || c.statut === 'failed') {
      const nouveau = c.statut === 'cancelled' ? 'annule' : 'echoue';
      await this.db.query(`UPDATE paiements SET statut=$2, maj_le=now() WHERE id=$1 AND statut='en_attente'`, [p.id, nouveau]);
      return nouveau;
    }
    return 'en_attente';
  }
}

/** Point d'entrée appelé par PayDunya (notification de paiement). Public, mais rien n'est cru sans confirmation côté API PayDunya. */
@Controller('paiements')
export class PaiementsController {
  private log = new Logger('Paiements');
  constructor(private service: PaiementsService, private paydunya: PaydunyaService) {}

  @Public() @Post('paydunya/ipn') @HttpCode(200)
  async notification(@Body() corps: any) {
    const d = corps?.data;
    const jeton = d?.invoice?.token;
    if (typeof jeton !== 'string' || !this.paydunya.hashValide(d?.hash)) {
      this.log.warn('notification refusée : jeton absent ou empreinte invalide');
      throw new BadRequestException('Notification invalide');
    }
    await this.service.finaliser(jeton);
    return { ok: true };
  }
}

@Module({
  controllers: [PaiementsController],
  providers: [PaiementsService, PaydunyaService],
  exports: [PaiementsService, PaydunyaService],
})
export class PaiementsModule {}
