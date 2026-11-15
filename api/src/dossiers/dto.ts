import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { TYPES, TypeDocument } from '../common/mask';

export class DeclarationDto {
  @IsIn(TYPES) typeDocument: TypeDocument;
  @IsString() @Length(4, 30) numero: string;
  @IsString() @Length(2, 100) nomProprietaire: string;
  @IsOptional() @IsDateString() dateNaissance?: string;
  @IsString() @Length(2, 120) lieuPerte: string;
  @IsDateString() datePerte: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;
}

export class SignalementDto {
  @IsIn(TYPES) typeDocument: TypeDocument;
  @IsString() @Length(4, 30) numero: string;
  @IsString() @Length(2, 100) nomSurDocument: string;
  @IsOptional() @IsDateString() dateNaissance?: string;
  @IsString() @Length(2, 120) lieuTrouve: string;
  @IsDateString() dateTrouve: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  /** Obligatoire à la création (contrôlé dans le contrôleur) ; à la modification, absente = photo conservée. */
  @IsOptional() @IsString() @MaxLength(3_000_000) photo?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;
}
