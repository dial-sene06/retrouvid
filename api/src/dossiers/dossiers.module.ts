import { Module } from '@nestjs/common';
import { CorrespondancesController } from './correspondances.controller';
import { DeclarationsController, SignalementsController } from './declarations.controller';
import { ExtrasController } from './extras.controller';
import { PaiementsModule } from '../paiements/paiements.module';
import { MatchingService } from './matching.service';

@Module({
  imports: [PaiementsModule],
  controllers: [DeclarationsController, SignalementsController, CorrespondancesController, ExtrasController],
  providers: [MatchingService],
})
export class DossiersModule {}
