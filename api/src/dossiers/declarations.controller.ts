import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles, Utilisateur } from '../common/auth';
import { position } from '../common/geo';
import { normaliserNumero } from '../common/mask';
import { decoderPhoto } from '../common/photo';
import { DbService } from '../db/db.service';
import { JournalService } from '../journal/journal.service';
import { DeclarationDto, SignalementDto } from './dto';
import { MatchingService } from './matching.service';

function pos(d: { lat?: number; lng?: number }) {
  try { return position(d); } catch { throw new BadRequestException('La latitude et la longitude vont ensemble'); }
}

function pasDansLeFutur(date: string, champ: string) {
  if (new Date(date) > new Date()) throw new BadRequestException(`${champ} ne peut pas être dans le futur`);
}

export function envoyerPhoto(res: Response, p: { type_mime: string; donnees: Buffer }) {
  res.set({ 'Content-Type': p.type_mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(p.donnees);
}

@Controller('declarations')
@Roles('citoyen')
export class DeclarationsController {
  constructor(private db: DbService, private match: MatchingService, private journal: JournalService) {}

  @Post() async creer(@CurrentUser() u: Utilisateur, @Body() d: DeclarationDto) {
    pasDansLeFutur(d.datePerte, 'La date de perte');
    const p = pos(d);
    const decl = await this.db.one(
      `INSERT INTO declarations (compte_id, type_document, numero, nom_proprietaire, date_naissance, lieu_perte, date_perte, description, lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [u.id, d.typeDocument, normaliserNumero(d.numero), d.nomProprietaire.trim(), d.dateNaissance ?? null, d.lieuPerte.trim(), d.datePerte, d.description ?? null, p.lat, p.lng]);
    await this.journal.ajouter(u.id, 'declaration_creee', 'declaration', decl.id);
    await this.match.apresDeclaration(decl);
    return this.db.one('SELECT * FROM declarations WHERE id = $1', [decl.id]);
  }

  /** Une déclaration ne se modifie que tant qu'aucun rapprochement n'a été proposé. */
  @Patch(':id') async modifier(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string, @Body() d: DeclarationDto) {
    pasDansLeFutur(d.datePerte, 'La date de perte');
    const p = pos(d);
    const cur = await this.db.one('SELECT compte_id, etat FROM declarations WHERE id = $1', [id]);
    if (!cur) throw new NotFoundException('Déclaration introuvable');
    if (cur.compte_id !== u.id) throw new ForbiddenException('Accès refusé');
    if (cur.etat !== 'en_attente') throw new BadRequestException('Cette déclaration est déjà en cours de vérification, elle ne peut plus être modifiée');
    const decl = await this.db.one(
      `UPDATE declarations SET type_document=$2, numero=$3, nom_proprietaire=$4, date_naissance=$5, lieu_perte=$6, date_perte=$7, description=$8, lat=$9, lng=$10
       WHERE id=$1 AND etat='en_attente' RETURNING *`,
      [id, d.typeDocument, normaliserNumero(d.numero), d.nomProprietaire.trim(), d.dateNaissance ?? null, d.lieuPerte.trim(), d.datePerte, d.description ?? null, p.lat, p.lng]);
    if (!decl) throw new BadRequestException("Cette déclaration vient d'être rapprochée, elle ne peut plus être modifiée");
    await this.journal.ajouter(u.id, 'declaration_modifiee', 'declaration', id);
    await this.match.apresDeclaration(decl);
    return this.db.one('SELECT * FROM declarations WHERE id = $1', [id]);
  }

  /** Retrait par son auteur : seulement tant qu'aucun rapprochement n'est en cours. */
  @Delete(':id') async supprimer(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string) {
    const cur = await this.db.one('SELECT compte_id, etat FROM declarations WHERE id = $1', [id]);
    if (!cur) throw new NotFoundException('Déclaration introuvable');
    if (cur.compte_id !== u.id) throw new ForbiddenException('Accès refusé');
    if (cur.etat !== 'en_attente') throw new BadRequestException('Cette déclaration est en cours de vérification ou terminée : elle ne peut plus être supprimée');
    await this.db.tx(async (t) => {
      await t.query(`DELETE FROM correspondances WHERE declaration_id = $1 AND etat = 'ecartee'`, [id]);
      await t.query('DELETE FROM declarations WHERE id = $1', [id]);
    });
    await this.journal.ajouter(u.id, 'declaration_supprimee', 'declaration', id);
    return { ok: true };
  }

  @Get() liste(@CurrentUser() u: Utilisateur) {
    return this.db.query('SELECT * FROM declarations WHERE compte_id = $1 ORDER BY cree_le DESC', [u.id]);
  }
}

@Controller('signalements')
@Roles('citoyen')
export class SignalementsController {
  constructor(private db: DbService, private match: MatchingService, private journal: JournalService) {}

  @Post() async creer(@CurrentUser() u: Utilisateur, @Body() d: SignalementDto) {
    pasDansLeFutur(d.dateTrouve, 'La date de découverte');
    const photo = d.photo ? decoderPhoto(d.photo) : null; // refusée avant toute écriture
    const p = pos(d);
    const sig = await this.db.one(
      `INSERT INTO signalements (compte_id, type_document, numero, nom_sur_document, date_naissance, lieu_trouve, date_trouve, description, lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [u.id, d.typeDocument, normaliserNumero(d.numero), d.nomSurDocument.trim(), d.dateNaissance ?? null, d.lieuTrouve.trim(), d.dateTrouve, d.description ?? null, p.lat, p.lng]);
    if (photo) await this.db.query('INSERT INTO signalement_photos (signalement_id, type_mime, donnees) VALUES ($1,$2,$3)', [sig.id, photo.mime, photo.donnees]);
    await this.journal.ajouter(u.id, 'signalement_cree', 'signalement', sig.id);
    await this.match.apresSignalement(sig);
    return this.db.one('SELECT id, type_document, lieu_trouve, date_trouve, etat, cree_le, $2::boolean AS a_photo FROM signalements WHERE id = $1', [sig.id, !!photo]);
  }

  /** Correction d'un signalement, tant qu'aucun rapprochement n'a été proposé. photo absente = conservée, chaîne vide = retirée. */
  @Patch(':id') async modifier(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string, @Body() d: SignalementDto) {
    pasDansLeFutur(d.dateTrouve, 'La date de découverte');
    const p = pos(d);
    const photo = d.photo ? decoderPhoto(d.photo) : null;
    const cur = await this.db.one('SELECT compte_id, etat FROM signalements WHERE id = $1', [id]);
    if (!cur) throw new NotFoundException('Signalement introuvable');
    if (cur.compte_id !== u.id) throw new ForbiddenException('Accès refusé');
    if (cur.etat !== 'en_attente') throw new BadRequestException('Ce signalement est déjà en cours de vérification, il ne peut plus être modifié');
    const sig = await this.db.tx(async (t) => {
      const r = await t.query(
        `UPDATE signalements SET type_document=$2, numero=$3, nom_sur_document=$4, date_naissance=$5, lieu_trouve=$6, date_trouve=$7, description=$8, lat=$9, lng=$10
         WHERE id=$1 AND etat='en_attente' RETURNING *`,
        [id, d.typeDocument, normaliserNumero(d.numero), d.nomSurDocument.trim(), d.dateNaissance ?? null, d.lieuTrouve.trim(), d.dateTrouve, d.description ?? null, p.lat, p.lng]);
      if (!r.rows[0]) return null;
      if (photo) await t.query(`INSERT INTO signalement_photos (signalement_id, type_mime, donnees) VALUES ($1,$2,$3)
        ON CONFLICT (signalement_id) DO UPDATE SET type_mime = EXCLUDED.type_mime, donnees = EXCLUDED.donnees, cree_le = now()`, [id, photo.mime, photo.donnees]);
      else if (d.photo === '') await t.query('DELETE FROM signalement_photos WHERE signalement_id = $1', [id]);
      return r.rows[0];
    });
    if (!sig) throw new BadRequestException("Ce signalement vient d'être rapproché, il ne peut plus être modifié");
    await this.journal.ajouter(u.id, 'signalement_modifie', 'signalement', id);
    await this.match.apresSignalement(sig);
    return { id, etat: sig.etat };
  }

  @Delete(':id') async supprimer(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string) {
    const cur = await this.db.one('SELECT compte_id, etat FROM signalements WHERE id = $1', [id]);
    if (!cur) throw new NotFoundException('Signalement introuvable');
    if (cur.compte_id !== u.id) throw new ForbiddenException('Accès refusé');
    if (cur.etat !== 'en_attente') throw new BadRequestException('Ce signalement est en cours de vérification ou terminé : il ne peut plus être supprimé');
    await this.db.tx(async (t) => {
      await t.query(`DELETE FROM correspondances WHERE signalement_id = $1 AND etat = 'ecartee'`, [id]);
      await t.query('DELETE FROM signalement_photos WHERE signalement_id = $1', [id]);
      await t.query('DELETE FROM signalements WHERE id = $1', [id]);
    });
    await this.journal.ajouter(u.id, 'signalement_supprime', 'signalement', id);
    return { ok: true };
  }

  /** Le découvreur ne revoit jamais les données personnelles du document : numéro et nom restent masqués. */
  @Get() liste(@CurrentUser() u: Utilisateur) {
    return this.db.query(
      `SELECT id, type_document, lieu_trouve, date_trouve, lat, lng, etat, cree_le,
              EXISTS(SELECT 1 FROM signalement_photos p WHERE p.signalement_id = signalements.id) AS a_photo
       FROM signalements WHERE compte_id = $1 ORDER BY cree_le DESC`, [u.id]);
  }

  /** Le découvreur peut revoir sa propre photo, et seulement la sienne. */
  @Get(':id/photo') async photo(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const p = await this.db.one('SELECT p.type_mime, p.donnees, s.compte_id FROM signalement_photos p JOIN signalements s ON s.id = p.signalement_id WHERE p.signalement_id = $1', [id]);
    if (!p) throw new NotFoundException('Photo introuvable');
    if (p.compte_id !== u.id) throw new ForbiddenException('Accès refusé');
    envoyerPhoto(res, p);
  }
}
