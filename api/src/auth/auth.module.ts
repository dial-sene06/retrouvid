import {
  BadRequestException, Body, ConflictException, Controller, Get, Global, Injectable, Logger, Module, Patch, Post, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { compare, hash } from 'bcryptjs';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { config } from '../config';
import { Public, CurrentUser, Utilisateur } from '../common/auth';
import { DbService } from '../db/db.service';
import { JournalService } from '../journal/journal.service';
import { EmailService } from './email.service';
import { GoogleVerifier } from './google';

export class InscriptionDto {
  @IsString() @Length(2, 60) nom: string;
  @IsString() @Length(2, 60) prenom: string;
  @IsEmail() email: string;
  @Matches(/^\+?[0-9 ]{8,18}$/, { message: 'numéro de téléphone invalide' }) telephone: string;
  @IsString() @MinLength(8, { message: 'le mot de passe doit contenir au moins 8 caractères' }) @MaxLength(72, { message: 'le mot de passe est limité à 72 caractères' }) motDePasse: string;
  /** Case « j'accepte les conditions d'utilisation » : sa date est conservée comme preuve. */
  @IsOptional() @IsBoolean() accepteCgu?: boolean;
  /** Champ piège, invisible pour une personne : un robot qui remplit tous les champs le renseigne. */
  @IsOptional() @IsString() @MaxLength(200) siteWeb?: string;
}
export class ConnexionDto {
  /** Adresse e-mail ou numéro de téléphone. */
  @IsOptional() @IsString() @MaxLength(254) identifiant?: string;
  /** Ancien nom du champ, toujours accepté. */
  @IsOptional() @IsString() @MaxLength(254) email?: string;
  @IsString() @MaxLength(72) motDePasse: string;
}

/**
 * Numéro réduit à ses chiffres, sans indicatif du Sénégal : « +221 77 123 45 67 », « 00221771234567 » et « 77 123 45 67 »
 * donnent tous « 771234567 ».
 */
export const normaliserTelephone = (t: string) => {
  let c = t.replace(/\D/g, '');
  if (c.startsWith('00')) c = c.slice(2);
  if (c.startsWith('221') && c.length === 12) c = c.slice(3);
  return c;
};

export class MotDePasseDto {
  @IsString() ancien: string;
  @IsString() @MinLength(8) @MaxLength(72) nouveau: string;
}

export class ProfilDto {
  @IsString() @Length(2, 60) nom: string;
  @IsString() @Length(2, 60) prenom: string;
  @Matches(/^\+?[0-9 ]{8,18}$/) telephone: string;
}

export class GoogleDto {
  @IsString() @Length(20, 4096) credential: string;
  @IsOptional() @IsString() @Matches(/^\+?[0-9 ]{8,18}$/, { message: 'numéro de téléphone invalide' }) telephone?: string;
}

export class VerificationDto {
  @IsUUID() verificationId: string;
  @Matches(/^[0-9]{6}$/, { message: 'le code comporte 6 chiffres' }) code: string;
}
export type Canal = 'sms' | 'email';
export class RenvoiDto {
  @IsUUID() verificationId: string;
  /** Changer de canal : « email » pour recevoir le code par e-mail plutôt que par SMS, et inversement. */
  @IsOptional() @IsIn(['sms', 'email']) canal?: Canal;
}

/** Informations d'un compte en attente de création, gardées avec le code tant que le numéro n'est pas vérifié. */
interface FuturCompte { nom: string; prenom: string; email: string; telephone: string; hache: string; cgu: boolean; googleSub: string | null }

/** Vérification du téléphone à la connexion : citoyens seulement (les inscriptions créent toujours des citoyens). */
const doitVerifier = (c: { role: string }) => config.verifTelephone.active() && c.role === 'citoyen';

/** Seuls les deux derniers chiffres sont montrés : l'écran ne révèle pas le numéro d'un compte. */
const masquerTelephone = (t: string) => { const c = t.replace(/\D/g, ''); return `•• ••• •• ${c.slice(-2)}`; };
/** Même principe pour l'e-mail : première lettre et domaine seulement (a•••@gmail.com). */
const masquerEmail = (e: string) => { const [n, d] = e.split('@'); return `${n.slice(0, 1)}•••@${d}`; };

const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Faux hachage comparé quand l'e-mail n'existe pas : le temps de réponse ne révèle pas si le compte existe.
const HACHAGE_LEURRE = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO5Ys1zQYm1b7oXk3n8y0tq8pQp9y1b2e';

@Injectable()
export class AuthService {
  private log = new Logger('SMS');
  constructor(private db: DbService, private jwt: JwtService, private journal: JournalService, private google: GoogleVerifier, private mail: EmailService) {}

  private jeton(c: { id: string; role: string }) { return this.jwt.signAsync({ sub: c.id, role: c.role }); }

  private async creerCompte(f: FuturCompte) {
    try {
      const c = await this.db.one(
        `INSERT INTO comptes (nom, prenom, email, telephone, mot_de_passe_hache, role, cgu_acceptees_le, google_sub)
         VALUES ($1,$2,lower($3),$4,$5,'citoyen', CASE WHEN $6::boolean THEN now() END, $7) RETURNING id, nom, prenom, email, role`,
        [f.nom, f.prenom, f.email, f.telephone, f.hache, f.cgu, f.googleSub]);
      await this.journal.ajouter(c.id, 'inscription', 'compte', c.id, f.googleSub ? { fournisseur: 'google' } : undefined);
      return { jeton: await this.jeton(c), compte: c };
    } catch (e: any) {
      if (e.code === '23505') throw new ConflictException('Un compte existe déjà avec cet e-mail');
      throw e;
    }
  }

  private async ouvrirSession(c: any, fournisseur?: string) {
    await this.journal.ajouter(c.id, 'connexion', 'compte', c.id, fournisseur ? { fournisseur } : undefined);
    return { jeton: await this.jeton(c), compte: { id: c.id, nom: c.nom, prenom: c.prenom, email: c.email, role: c.role } };
  }

  // ---- Vérification du téléphone : un code à 6 chiffres, « envoyé » par un SMS simulé ----

  private hacheCode(id: string, code: string) { return createHash('sha256').update(`${id}:${code}`).digest('hex'); }
  private nouveauCode() { return String(randomInt(0, 1000000)).padStart(6, '0'); }

  /**
   * Le SMS simulé affiche le code à l'écran : il ne prouve rien. Dès que l'e-mail est configuré, c'est lui qui porte le code,
   * et le SMS simulé ne sert plus que de secours quand l'e-mail n'a pas pu partir.
   */
  private emailParDefaut() { return this.mail.configure() && config.verifTelephone.simulation(); }

  /** Aucun SMS ne part : en simulation, le code est écrit dans le journal du serveur et renvoyé à l'écran. */
  private envoyerSms(id: string, telephone: string, code: string, emailEchoue = false) {
    const masque = masquerTelephone(telephone);
    const simulation = config.verifTelephone.simulation();
    this.log.log(simulation ? `SMS simulé vers ${masque} : votre code RetrouvID est ${code}` : `Code demandé pour ${masque} (aucun fournisseur SMS branché)`);
    return {
      verificationRequise: true, verificationId: id, canal: 'sms' as Canal, telephone: masque, dureeMinutes: config.verifTelephone.dureeMinutes,
      emailDisponible: this.mail.configure(), smsDisponible: true,
      ...(emailEchoue ? { emailEchoue: true } : {}),
      ...(simulation ? { codeSimule: code } : {}),
    };
  }

  /** Le code part pour de vrai par Brevo, il n'est jamais renvoyé à l'écran. */
  private async envoyerEmail(id: string, email: string, telephone: string, code: string) {
    const d = config.verifTelephone.dureeMinutes;
    const ok = await this.mail.envoyer(email, `Votre code RetrouvID : ${code}`,
      `Votre code de vérification RetrouvID est ${code}. Il est valable ${d} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
      `<p>Votre code de vérification RetrouvID est :</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${echapper(code)}</p>`
      + `<p>Il est valable ${d} minutes.</p><p style="color:#666">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`);
    if (!ok) throw new ServiceUnavailableException("L'e-mail n'a pas pu être envoyé. Réessayez ou recevez le code par SMS.");
    this.log.log(`Code envoyé par e-mail à ${masquerEmail(email)}`);
    return {
      verificationRequise: true, verificationId: id, canal: 'email' as Canal, email: masquerEmail(email), telephone: masquerTelephone(telephone),
      dureeMinutes: d, emailDisponible: true, smsDisponible: !this.emailParDefaut(),
    };
  }

  private envoyerCode(v: { id: string; canal: Canal; email: string | null; telephone: string }, code: string) {
    return v.canal === 'email' && v.email ? this.envoyerEmail(v.id, v.email, v.telephone, code) : this.envoyerSms(v.id, v.telephone, code);
  }

  private async demanderCode(objet: 'inscription' | 'connexion', telephone: string, email: string, compteId: string | null, charge: object | null) {
    const id = randomUUID(), code = this.nouveauCode();
    await this.db.query(`DELETE FROM verifications_telephone WHERE expire_le < now() - interval '1 day'`);
    await this.db.query(
      `INSERT INTO verifications_telephone (id, objet, compte_id, telephone, email, code_hache, charge, expire_le)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb, now() + make_interval(mins => $8))`,
      [id, objet, compteId, telephone, email, this.hacheCode(id, code), charge ? JSON.stringify(charge) : null, config.verifTelephone.dureeMinutes]);
    if (this.emailParDefaut()) {
      try {
        const r = await this.envoyerEmail(id, email, telephone, code);
        await this.db.query(`UPDATE verifications_telephone SET canal = 'email' WHERE id = $1`, [id]);
        return r;
      } catch {
        // l'e-mail n'est pas parti : le SMS simulé prend le relais pour ne pas bloquer la personne
        this.log.warn(`E-mail indisponible pour ${masquerEmail(email)} : repli sur le SMS simulé`);
      }
    }
    return this.envoyerSms(id, telephone, code, this.emailParDefaut());
  }

  /** Nouveau code, éventuellement sur l'autre canal. L'ancien code ne vaut plus rien. */
  async renvoyerCode(d: RenvoiDto) {
    if (d.canal === 'email' && !this.mail.configure()) throw new BadRequestException("L'envoi du code par e-mail n'est pas disponible pour le moment.");
    if (d.canal === 'sms' && this.emailParDefaut()) {
      // le SMS simulé n'est rendu qu'en secours, quand le dernier envoi par e-mail a échoué
      const cur = await this.db.one('SELECT canal FROM verifications_telephone WHERE id = $1', [d.verificationId]);
      if (cur?.canal === 'email') throw new BadRequestException('Le code est envoyé par e-mail. Pensez à regarder dans les spams.');
    }
    const code = this.nouveauCode();
    const v = await this.db.one(
      `UPDATE verifications_telephone SET code_hache = $2, tentatives = 0, envois = envois + 1, expire_le = now() + make_interval(mins => $3),
         canal = COALESCE($5, canal)
       WHERE id = $1 AND utilisee_le IS NULL AND envois < $4 AND cree_le > now() - interval '30 minutes' RETURNING id, telephone, email, canal`,
      [d.verificationId, this.hacheCode(d.verificationId, code), config.verifTelephone.dureeMinutes, config.verifTelephone.envoisMax, d.canal ?? null]);
    if (!v) throw new BadRequestException("Impossible d'envoyer un nouveau code. Recommencez depuis le début.");
    try {
      return await this.envoyerCode(v, code);
    } catch (e) {
      // e-mail non parti : on revient au SMS pour que le secours reste possible
      if (v.canal === 'email') await this.db.query(`UPDATE verifications_telephone SET canal = 'sms' WHERE id = $1`, [v.id]);
      throw e;
    }
  }

  /** Le code ouvre la session (connexion) ou crée le compte (inscription). Il ne sert qu'une fois. */
  async verifierCode(d: VerificationDto) {
    // chaque essai est compté avant la comparaison : cinq essais au plus, même envoyés en parallèle
    const v = await this.db.one(
      `UPDATE verifications_telephone SET tentatives = tentatives + 1
       WHERE id = $1 AND utilisee_le IS NULL AND expire_le > now() AND tentatives < $2 RETURNING *`,
      [d.verificationId, config.verifTelephone.tentativesMax]);
    if (!v) throw new UnauthorizedException('Ce code a expiré ou a été trop souvent essayé. Recommencez depuis le début.');
    const attendu = Buffer.from(v.code_hache), recu = Buffer.from(this.hacheCode(v.id, d.code));
    if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) throw new UnauthorizedException('Code incorrect');
    const pris = await this.db.one('UPDATE verifications_telephone SET utilisee_le = now(), charge = NULL WHERE id = $1 AND utilisee_le IS NULL RETURNING id', [v.id]);
    if (!pris) throw new UnauthorizedException('Ce code a déjà été utilisé');
    if (v.objet === 'inscription') return this.creerCompte(v.charge as FuturCompte);
    const c = await this.db.one('SELECT * FROM comptes WHERE id = $1', [v.compte_id]);
    if (!c || !c.actif) throw new UnauthorizedException('Compte désactivé');
    return this.ouvrirSession(c, v.charge?.fournisseur);
  }

  async inscrire(d: InscriptionDto) {
    if (d.siteWeb) throw new BadRequestException('Demande refusée');
    const f: FuturCompte = {
      nom: d.nom.trim(), prenom: d.prenom.trim(), email: d.email.toLowerCase(), telephone: d.telephone.trim(),
      hache: await hash(d.motDePasse, 12), cgu: d.accepteCgu === true, googleSub: null,
    };
    if (!config.verifTelephone.active()) return this.creerCompte(f);
    // le compte n'existe pas tant que le numéro n'est pas vérifié : ses informations attendent avec le code
    if (await this.db.one('SELECT id FROM comptes WHERE email = $1', [f.email])) throw new ConflictException('Un compte existe déjà avec cet e-mail');
    return this.demanderCode('inscription', f.telephone, f.email, null, f);
  }

  /**
   * Compte désigné par un numéro. Le numéro n'est pas unique (deux comptes peuvent le partager) : on garde le compte actif
   * dont le mot de passe correspond. Au plus cinq candidats sont essayés. Si plusieurs comptes ont ce numéro et ce mot de passe,
   * on ne choisit pas au hasard : l'e-mail est demandé.
   */
  private async compteParTelephone(telephone: string, motDePasse: string) {
    const n = normaliserTelephone(telephone);
    const candidats = (await this.db.query(
      `SELECT * FROM comptes WHERE right(regexp_replace(telephone, '\\D', '', 'g'), 9) = right($1, 9) AND actif ORDER BY cree_le LIMIT 20`, [n]))
      .filter((c: any) => normaliserTelephone(c.telephone) === n).slice(0, 5);
    if (!candidats.length) { await compare(motDePasse, HACHAGE_LEURRE); return null; }
    const bons: any[] = [];
    for (const c of candidats) if (await compare(motDePasse, c.mot_de_passe_hache)) bons.push(c);
    if (bons.length > 1) throw new ConflictException('Plusieurs comptes utilisent ce numéro. Connectez-vous avec votre adresse e-mail.');
    return bons[0] ?? null;
  }

  async connecter(d: ConnexionDto) {
    const id = (d.identifiant ?? d.email ?? '').trim();
    const parTelephone = !id.includes('@');
    if (parTelephone && !/^\+?[0-9 .-]{8,20}$/.test(id)) throw new BadRequestException('Saisissez une adresse e-mail ou un numéro de téléphone');
    let c: any, ok: boolean;
    if (parTelephone) { c = await this.compteParTelephone(id, d.motDePasse); ok = !!c; }
    else {
      c = await this.db.one('SELECT * FROM comptes WHERE email = lower($1)', [id]);
      ok = await compare(d.motDePasse, c?.mot_de_passe_hache ?? HACHAGE_LEURRE);
    }
    // même message dans tous les cas : on ne révèle pas si l'e-mail ou le numéro existe
    if (!c || !c.actif || !ok) throw new UnauthorizedException('Identifiant ou mot de passe incorrect');
    // le code n'est demandé qu'aux citoyens : les agents et l'administrateur sont des comptes internes, créés par l'administration
    if (doitVerifier(c)) return this.demanderCode('connexion', c.telephone, c.email, c.id, null);
    return this.ouvrirSession(c);
  }

  /**
   * Connexion avec Google. Un compte existant est retrouvé par l'identifiant Google. Un compte créé avec un mot de passe n'est
   * jamais rattaché automatiquement : l'e-mail d'inscription n'est pas vérifié chez nous, le rattacher permettrait à quelqu'un
   * qui s'est inscrit avec l'e-mail d'autrui d'entrer dans le compte de cette personne.
   */
  async connecterGoogle(d: GoogleDto) {
    const g = await this.google.verifier(d.credential);
    if (!g.emailVerifie) throw new UnauthorizedException("L'adresse e-mail de ce compte Google n'est pas vérifiée");
    const email = g.email.toLowerCase();
    let c = await this.db.one('SELECT * FROM comptes WHERE google_sub = $1', [g.sub]);
    if (!c) {
      const memeEmail = await this.db.one('SELECT id FROM comptes WHERE email = $1', [email]);
      if (memeEmail) throw new ConflictException('Un compte existe déjà avec cet e-mail. Connectez-vous avec votre mot de passe.');
      // le téléphone est indispensable à la remise du document et Google ne le fournit pas : on le demande avant de créer le compte
      if (!d.telephone) return { telephoneRequis: true, prenom: g.prenom, nom: g.nom, email };
      const f: FuturCompte = {
        nom: (g.nom || 'Utilisateur').slice(0, 60), prenom: (g.prenom || 'Google').slice(0, 60), email, telephone: d.telephone.trim(),
        hache: await hash(randomBytes(32).toString('hex'), 12), cgu: false, googleSub: g.sub,
      };
      return config.verifTelephone.active() ? this.demanderCode('inscription', f.telephone, f.email, null, f) : this.creerCompte(f);
    }
    if (!c.actif) throw new UnauthorizedException('Compte désactivé');
    if (doitVerifier(c)) return this.demanderCode('connexion', c.telephone, c.email, c.id, { fournisseur: 'google' });
    return this.ouvrirSession(c, 'google');
  }
}

@Controller('auth')
export class AuthController {
  constructor(private s: AuthService, private db: DbService, private journal: JournalService) {}
  @Public() @Throttle({ default: { limit: config.limiteAuth, ttl: 60000 } }) @Post('inscription')
  inscription(@Body() d: InscriptionDto) { return this.s.inscrire(d); }
  @Public() @Throttle({ default: { limit: config.limiteAuth, ttl: 60000 } }) @Post('connexion')
  connexion(@Body() d: ConnexionDto) { return this.s.connecter(d); }
  @Public() @Get('google/config')
  googleConfig() { return { clientId: config.googleClientId() || null }; }
  @Public() @Throttle({ default: { limit: config.limiteAuth, ttl: 60000 } }) @Post('google')
  google(@Body() d: GoogleDto) { return this.s.connecterGoogle(d); }
  @Public() @Throttle({ default: { limit: config.limiteAuth, ttl: 60000 } }) @Post('verification')
  verification(@Body() d: VerificationDto) { return this.s.verifierCode(d); }
  @Public() @Throttle({ default: { limit: config.limiteAuth, ttl: 60000 } }) @Post('verification/renvoyer')
  renvoyer(@Body() d: RenvoiDto) { return this.s.renvoyerCode(d); }
  @Throttle({ default: { limit: config.limiteAuth, ttl: 60000 } }) @Patch('mot-de-passe')
  async changerMotDePasse(@CurrentUser() u: Utilisateur, @Body() d: MotDePasseDto) {
    const c = await this.db.one('SELECT mot_de_passe_hache, google_sub FROM comptes WHERE id = $1', [u.id]);
    if (c.google_sub) throw new BadRequestException('Ce compte se connecte avec Google : le mot de passe se gère chez Google');
    if (!(await compare(d.ancien, c.mot_de_passe_hache))) throw new BadRequestException('Le mot de passe actuel est incorrect');
    if (d.ancien === d.nouveau) throw new BadRequestException("Le nouveau mot de passe doit différer de l'ancien");
    await this.db.query('UPDATE comptes SET mot_de_passe_hache = $2 WHERE id = $1', [u.id, await hash(d.nouveau, 12)]);
    await this.journal.ajouter(u.id, 'mot_de_passe_modifie', 'compte', u.id);
    return { ok: true };
  }
  @Patch('moi') async majProfil(@CurrentUser() u: Utilisateur, @Body() d: ProfilDto) {
    const c = await this.db.one('UPDATE comptes SET nom=$2, prenom=$3, telephone=$4 WHERE id=$1 RETURNING id, nom, prenom, email, telephone, role',
      [u.id, d.nom.trim(), d.prenom.trim(), d.telephone.trim()]);
    await this.journal.ajouter(u.id, 'profil_modifie', 'compte', u.id);
    return c;
  }
  @Get('moi')
  moi(@CurrentUser() u: Utilisateur) {
    return this.db.one('SELECT id, nom, prenom, email, telephone, role FROM comptes WHERE id = $1', [u.id]);
  }
}

@Global()
@Module({
  imports: [JwtModule.registerAsync({ useFactory: () => ({ secret: config.jwtSecret(), signOptions: { expiresIn: '8h', algorithm: 'HS256' }, verifyOptions: { algorithms: ['HS256'] } }) })],
  controllers: [AuthController],
  providers: [AuthService, GoogleVerifier, EmailService],
  exports: [JwtModule, EmailService],
})
export class AuthModule {}
