import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { Public } from '../common/auth';
import { DbService } from '../db/db.service';

class ContactDto {
  @IsString() @Length(2, 80) nom: string;
  @IsEmail() email: string;
  @IsString() @Length(3, 120) sujet: string;
  @IsString() @Length(10, 1000) message: string;
  /** Champ piège (voir InscriptionDto) : renseigné, le message est jeté sans être enregistré. */
  @IsOptional() @IsString() @MaxLength(200) siteWeb?: string;
}

/** Routes sans connexion : page d'accueil et centre d'aide. Elles ne renvoient que des comptages. */
@Controller('public')
export class PublicController {
  constructor(private db: DbService) {}

  /** Chiffres affichés sur l'accueil. Aucune donnée personnelle : ni nom, ni lieu, ni numéro. */
  @Public() @Get('stats') async stats() {
    const t = await this.db.one(`SELECT
      (SELECT count(*) FROM declarations)::int AS declarations,
      (SELECT count(*) FROM signalements)::int AS signalements,
      (SELECT count(*) FROM correspondances WHERE etat IN ('remise','cloturee'))::int AS restitues`);
    const recents = await this.db.query(
      `SELECT d.type_document, r.cloturee_le AS date FROM remises r
       JOIN correspondances c ON c.id = r.correspondance_id JOIN declarations d ON d.id = c.declaration_id
       WHERE r.cloturee_le IS NOT NULL ORDER BY r.cloturee_le DESC LIMIT 5`);
    return { ...t, recents };
  }

  /** Message du formulaire de contact. 5 envois par minute et par adresse au plus. */
  @Public() @Throttle({ default: { limit: 5, ttl: 60000 } }) @Post('contact')
  async contact(@Body() d: ContactDto) {
    if (d.siteWeb) return { ok: true }; // réponse identique : le robot ne sait pas qu'il a été reconnu
    await this.db.query('INSERT INTO contacts (nom, email, sujet, message) VALUES ($1, lower($2), $3, $4)', [d.nom.trim(), d.email, d.sujet.trim(), d.message.trim()]);
    return { ok: true };
  }
}

@Module({ controllers: [PublicController] })
export class PublicModule {}
