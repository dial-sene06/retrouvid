import { Controller, Delete, Get, Global, Injectable, Logger, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser, Utilisateur } from '../common/auth';
import { DbService } from '../db/db.service';

@Injectable()
export class NotificationsService {
  private log = new Logger('Notifications');
  constructor(private db: DbService) {}
  /** Enregistre la notification. L'envoi d'e-mail est simulé : il apparaît dans les journaux du serveur. */
  async envoyer(compteId: string, type: string, message: string) {
    await this.db.query('INSERT INTO notifications (compte_id, type, message) VALUES ($1,$2,$3)', [compteId, type, message]);
    this.log.log(`e-mail simulé -> compte ${compteId} : ${message}`);
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private db: DbService) {}
  @Get() liste(@CurrentUser() u: Utilisateur) {
    return this.db.query('SELECT id, type, message, lue, cree_le FROM notifications WHERE compte_id = $1 ORDER BY cree_le DESC LIMIT 50', [u.id]);
  }
  @Post('lues') async toutesLues(@CurrentUser() u: Utilisateur) {
    await this.db.query('UPDATE notifications SET lue = true WHERE compte_id = $1 AND NOT lue', [u.id]);
    return { ok: true };
  }
  @Delete(':id') async supprimer(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.query('DELETE FROM notifications WHERE id = $1 AND compte_id = $2', [id, u.id]);
    return { ok: true };
  }
  @Post(':id/lue') async lue(@CurrentUser() u: Utilisateur, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.query('UPDATE notifications SET lue = true WHERE id = $1 AND compte_id = $2', [id, u.id]);
    return { ok: true };
  }
}

@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
