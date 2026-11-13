import { BadRequestException, Body, ConflictException, Controller, Get, Delete, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { envoyerPhoto } from '../dossiers/declarations.controller';
import { hash } from 'bcryptjs';
import { IsBoolean, IsEmail, IsString, Length, Matches, MinLength } from 'class-validator';
import { CurrentUser, Roles, Utilisateur } from '../common/auth';
import { masquerNom, masquerNumero } from '../common/mask';
import { DbService } from '../db/db.service';
import { JournalService } from '../journal/journal.service';

class AgentDto {
  @IsString() @Length(2, 60) nom: string;
  @IsString() @Length(2, 60) prenom: string;
  @IsEmail() email: string;
  @Matches(/^\+?[0-9 ]{8,18}$/) telephone: string;
  @IsString() @MinLength(8) motDePasse: string;
}
class ActifDto { @IsBoolean() actif: boolean; }
class MotifDto { @IsString() @Length(5, 200) motif: string; }

@Controller('admin')
@Roles('admin')
export class AdminController {
  constructor(private db: DbService, private journal: JournalService) {}

  @Get('stats') async stats() {
    const [comptes, declarations, signalements, correspondances, paiements] = await Promise.all([
      this.db.query('SELECT role, count(*)::int AS n FROM comptes GROUP BY role'),
      this.db.query('SELECT etat, count(*)::int AS n FROM declarations GROUP BY etat'),
      this.db.query('SELECT etat, count(*)::int AS n FROM signalements GROUP BY etat'),
      this.db.query('SELECT etat, count(*)::int AS n FROM correspondances GROUP BY etat'),
      this.db.one('SELECT count(*)::int AS n, coalesce(sum(montant),0)::int AS total FROM paiements WHERE statut IN (\'reussi\',\'simule\')'),
    ]);
    return { comptes, declarations, signalements, correspondances, paiements };
  }


  /** Série des 14 derniers jours (jours sans événement = 0). Le nom de table vient d'une liste fermée, jamais d'une saisie. */
  private serie(table: 'declarations' | 'signalements' | 'correspondances' | 'comptes') {
    return this.db.query(
      `WITH j AS (SELECT d::date AS jour FROM generate_series(current_date - 13, current_date, interval '1 day') d)
       SELECT to_char(j.jour, 'YYYY-MM-DD') AS jour, count(t.id)::int AS n
       FROM j LEFT JOIN ${table} t ON t.cree_le::date = j.jour GROUP BY j.jour ORDER BY j.jour`);
  }

  /** Données agrégées du tableau de bord : aucune donnée personnelle, uniquement des comptages. */
  @Get('tableau') async tableau() {
    const [declarations, signalements, correspondances, comptes, parEtat, types, recentes, activite, paiements] = await Promise.all([
      this.serie('declarations'), this.serie('signalements'), this.serie('correspondances'), this.serie('comptes'),
      this.db.query('SELECT etat, count(*)::int AS n FROM correspondances GROUP BY etat'),
      this.db.query(`SELECT type_document, count(*)::int AS n FROM
        (SELECT type_document FROM declarations UNION ALL SELECT type_document FROM signalements) x GROUP BY type_document`),
      this.db.query(`SELECT c.id, c.cree_le, c.score, c.etat, d.type_document
        FROM correspondances c JOIN declarations d ON d.id = c.declaration_id ORDER BY c.cree_le DESC LIMIT 6`),
      this.db.query(`SELECT j.id, j.action, j.cree_le, j.objet_type, nullif(trim(coalesce(c.prenom,'') || ' ' || coalesce(c.nom,'')), '') AS compte
        FROM journal_actions j LEFT JOIN comptes c ON c.id = j.compte_id ORDER BY j.cree_le DESC LIMIT 8`),
      this.db.one('SELECT count(*)::int AS n, coalesce(sum(montant),0)::int AS total FROM paiements WHERE statut IN (\'reussi\',\'simule\')'),
    ]);
    return { declarations, signalements, correspondances, comptes, parEtat, types, recentes, activite, paiements };
  }

  @Get('contacts') contacts() {
    return this.db.query('SELECT id, nom, email, sujet, message, traite, cree_le FROM contacts ORDER BY traite, cree_le DESC LIMIT 100');
  }
  @Post('contacts/:id/traite') async contactTraite(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.db.one('UPDATE contacts SET traite = true WHERE id = $1 RETURNING id', [id]);
    if (!r) throw new NotFoundException('Message introuvable');
    await this.journal.ajouter(u.id, 'contact_traite', 'contact', id);
    return { ok: true };
  }

  @Get('comptes') comptes() {
    return this.db.query('SELECT id, nom, prenom, email, telephone, role, actif, cree_le FROM comptes ORDER BY cree_le DESC');
  }

  @Post('agents') async creerAgent(@CurrentUser() u: Utilisateur, @Body() d: AgentDto) {
    try {
      const c = await this.db.one(
        `INSERT INTO comptes (nom, prenom, email, telephone, mot_de_passe_hache, role) VALUES ($1,$2,lower($3),$4,$5,'agent') RETURNING id, email, role`,
        [d.nom, d.prenom, d.email, d.telephone, await hash(d.motDePasse, 10)]);
      await this.journal.ajouter(u.id, 'agent_cree', 'compte', c.id);
      return c;
    } catch (e: any) {
      if (e.code === '23505') throw new ConflictException('Un compte existe déjà avec cet e-mail');
      throw e;
    }
  }

  @Patch('comptes/:id/actif') async basculer(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string, @Body() d: ActifDto) {
    if (id === u.id) throw new BadRequestException('Vous ne pouvez pas désactiver votre propre compte');
    const c = await this.db.one('UPDATE comptes SET actif = $2 WHERE id = $1 RETURNING id, actif', [id, d.actif]);
    if (!c) throw new NotFoundException('Compte introuvable');
    await this.journal.ajouter(u.id, d.actif ? 'compte_reactive' : 'compte_desactive', 'compte', id);
    return c;
  }

  /** La recherche renvoie des valeurs masquées. Le détail complet passe par les routes ci-dessous, qui journalisent. */
  @Get('recherche') async recherche(@CurrentUser() u: Utilisateur, @Query('q') q = '') {
    const t = q.trim();
    if (t.length < 3) throw new BadRequestException('Saisissez au moins 3 caractères');
    const like = `%${t.replace(/[%_]/g, '')}%`;
    const d = await this.db.query(`SELECT id, type_document, numero, nom_proprietaire AS nom, etat, cree_le FROM declarations
      WHERE numero ILIKE $1 OR nom_proprietaire ILIKE $1 ORDER BY cree_le DESC LIMIT 25`, [like]);
    const s = await this.db.query(`SELECT id, type_document, numero, nom_sur_document AS nom, etat, cree_le FROM signalements
      WHERE numero ILIKE $1 OR nom_sur_document ILIKE $1 ORDER BY cree_le DESC LIMIT 25`, [like]);
    await this.journal.ajouter(u.id, 'recherche', null as any, undefined, { longueur: t.length });
    const m = (x: any, type: string) => ({ ...x, type, numero: masquerNumero(x.numero), nom: masquerNom(x.nom) });
    return { declarations: d.map((x) => m(x, 'declaration')), signalements: s.map((x) => m(x, 'signalement')) };
  }

  @Get('declarations/:id') async declaration(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string) {
    const d = await this.db.one('SELECT * FROM declarations WHERE id = $1', [id]);
    if (!d) throw new NotFoundException('Déclaration introuvable');
    await this.journal.ajouter(u.id, 'consultation_donnees_masquees', 'declaration', id);
    return d;
  }
  @Get('signalements/:id') async signalement(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string) {
    const s = await this.db.one('SELECT * FROM signalements WHERE id = $1', [id]);
    if (!s) throw new NotFoundException('Signalement introuvable');
    await this.journal.ajouter(u.id, 'consultation_donnees_masquees', 'signalement', id);
    const photo = await this.db.one('SELECT 1 AS ok FROM signalement_photos WHERE signalement_id = $1', [id]);
    return { ...s, a_photo: !!photo };
  }
  @Get('signalements/:id/photo') async photo(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const p = await this.db.one('SELECT type_mime, donnees FROM signalement_photos WHERE signalement_id = $1', [id]);
    if (!p) throw new NotFoundException('Photo introuvable');
    await this.journal.ajouter(u.id, 'consultation_photo', 'signalement', id);
    envoyerPhoto(res, p);
  }

  /** Retrait d'un contenu frauduleux ou erroné. Refusé dès qu'un paiement existe : la traçabilité financière prime. */
  private async retirer(u: Utilisateur, table: 'declarations' | 'signalements', col: 'declaration_id' | 'signalement_id', autre: 'declarations' | 'signalements', autreCol: 'declaration_id' | 'signalement_id', id: string, motif: string) {
    const x = await this.db.one(`SELECT id FROM ${table} WHERE id = $1`, [id]);
    if (!x) throw new NotFoundException('Contenu introuvable');
    const payes = await this.db.one(`SELECT count(*)::int AS n FROM correspondances c JOIN paiements p ON p.correspondance_id = c.id AND p.statut IN ('reussi','simule') WHERE c.${col} = $1`, [id]);
    if (payes.n > 0) throw new BadRequestException('Un paiement est rattaché à ce contenu : il ne peut pas être retiré');
    await this.db.tx(async (t) => {
      const liees = (await t.query(`SELECT ${autreCol} AS autre FROM correspondances WHERE ${col} = $1`, [id])).rows;
      await t.query(`DELETE FROM correspondances WHERE ${col} = $1`, [id]);
      if (table === 'signalements') await t.query('DELETE FROM signalement_photos WHERE signalement_id = $1', [id]);
      await t.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      for (const l of liees) {
        await t.query(`UPDATE ${autre} SET etat='en_attente' WHERE id=$1 AND etat='en_verification'
          AND NOT EXISTS (SELECT 1 FROM correspondances WHERE ${autreCol} = $1 AND etat IN ('en_verification','validee_agent','validee_citoyen','payee','remise'))`, [l.autre]);
      }
    });
    await this.journal.ajouter(u.id, 'contenu_retire', table === 'declarations' ? 'declaration' : 'signalement', id, { motif });
    return { ok: true };
  }
  @Delete('declarations/:id') retirerDeclaration(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string, @Body() d: MotifDto) {
    return this.retirer(u, 'declarations', 'declaration_id', 'signalements', 'signalement_id', id, d.motif);
  }
  @Delete('signalements/:id') retirerSignalement(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string, @Body() d: MotifDto) {
    return this.retirer(u, 'signalements', 'signalement_id', 'declarations', 'declaration_id', id, d.motif);
  }

  @Get('correspondances') correspondances() {
    return this.db.query(`SELECT id, declaration_id, signalement_id, score, etat, cree_le FROM correspondances ORDER BY cree_le DESC LIMIT 100`);
  }

  /** Clôture : une fois la remise confirmée par les deux parties, les données personnelles sont effacées. */
  @Post('correspondances/:id/cloturer') async cloturer(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.db.one('SELECT * FROM correspondances WHERE id = $1', [id]);
    if (!c) throw new NotFoundException('Correspondance introuvable');
    if (c.etat !== 'remise') throw new BadRequestException("On ne clôture qu'une correspondance dont la remise est confirmée par les deux parties");
    await this.db.tx(async (t) => {
      await t.query(`UPDATE declarations SET numero='ANONYMISE', nom_proprietaire='ANONYMISE', date_naissance=NULL, description=NULL, etat='cloture' WHERE id=$1`, [c.declaration_id]);
      await t.query(`UPDATE signalements SET numero='ANONYMISE', nom_sur_document='ANONYMISE', date_naissance=NULL, description=NULL, etat='cloture' WHERE id=$1`, [c.signalement_id]);
      await t.query('DELETE FROM signalement_photos WHERE signalement_id=$1', [c.signalement_id]);
      await t.query('DELETE FROM messages WHERE correspondance_id=$1', [id]);
      await t.query('UPDATE declarations SET lat=NULL, lng=NULL WHERE id=$1', [c.declaration_id]);
      await t.query('UPDATE signalements SET lat=NULL, lng=NULL WHERE id=$1', [c.signalement_id]);
      await t.query(`UPDATE correspondances SET etat='cloturee' WHERE id=$1`, [id]);
    });
    await this.journal.ajouter(u.id, 'cloture_anonymisation', 'correspondance', id);
    return { ok: true, etat: 'cloturee' };
  }

  @Get('journal') journalListe(@Query('action') action?: string) {
    return this.db.query(
      `SELECT j.id, j.action, j.objet_type, j.objet_id, j.detail, j.cree_le, c.email AS compte
       FROM journal_actions j LEFT JOIN comptes c ON c.id = j.compte_id
       WHERE ($1::text IS NULL OR j.action = $1) ORDER BY j.id DESC LIMIT 200`, [action ?? null]);
  }
}

@Module({ controllers: [AdminController] })
export class AdminModule {}
