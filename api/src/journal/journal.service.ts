import { Global, Injectable, Module } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Injectable()
export class JournalService {
  constructor(private db: DbService) {}
  ajouter(compteId: string | null, action: string, objetType?: string, objetId?: string, detail?: object) {
    return this.db.query(
      'INSERT INTO journal_actions (compte_id, action, objet_type, objet_id, detail) VALUES ($1,$2,$3,$4,$5)',
      [compteId, action, objetType ?? null, objetId ?? null, detail ? JSON.stringify(detail) : null],
    );
  }
}
@Global()
@Module({ providers: [JournalService], exports: [JournalService] })
export class JournalModule {}
