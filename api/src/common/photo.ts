import { BadRequestException } from '@nestjs/common';

export const PHOTO_MAX_OCTETS = 2 * 1024 * 1024;

/** Décode une photo reçue en data URL. Le type est contrôlé sur les premiers octets, pas sur ce que déclare le client. */
export function decoderPhoto(dataUrl: string): { mime: string; donnees: Buffer } {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!m) throw new BadRequestException('Photo invalide : formats acceptés JPEG, PNG ou WebP');
  const donnees = Buffer.from(m[2], 'base64');
  if (donnees.length === 0 || donnees.length > PHOTO_MAX_OCTETS) throw new BadRequestException('Photo trop lourde (2 Mo maximum)');
  const jpeg = donnees[0] === 0xff && donnees[1] === 0xd8 && donnees[2] === 0xff;
  const png = donnees.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const webp = donnees.subarray(0, 4).toString('latin1') === 'RIFF' && donnees.subarray(8, 12).toString('latin1') === 'WEBP';
  const reel = jpeg ? 'image/jpeg' : png ? 'image/png' : webp ? 'image/webp' : null;
  if (!reel || reel !== m[1]) throw new BadRequestException("Le fichier n'est pas une image valide");
  return { mime: reel, donnees };
}
