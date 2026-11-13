import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './common/auth';
import { DbModule } from './db/db.service';
import { DossiersModule } from './dossiers/dossiers.module';
import { GeoModule } from './geo/geo.module';
import { PaiementsModule } from './paiements/paiements.module';
import { PublicModule } from './public/public.module';
import { JournalModule } from './journal/journal.service';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    DbModule, JournalModule, NotificationsModule, AuthModule, DossiersModule, AdminModule, GeoModule, PublicModule, PaiementsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
