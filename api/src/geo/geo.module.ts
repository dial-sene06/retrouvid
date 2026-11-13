import { BadRequestException, Controller, Get, Injectable, Logger, Module, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { config } from '../config';

export interface Lieu { adresse: string; lat: number; lng: number }

/**
 * Géocodage par OpenStreetMap (service Nominatim). Le navigateur ne l'appelle jamais directement :
 * le serveur s'en charge, ce qui évite d'exposer l'adresse IP de l'utilisateur à un tiers et permet de limiter le débit.
 * Si le service est injoignable, on répond « pas d'adresse » : le formulaire reste utilisable avec les coordonnées seules.
 */
@Injectable()
export class GeoService {
  private log = new Logger('Geo');

  // Le service public de Nominatim tolère une requête par seconde pour toute l'application et demande de réutiliser les résultats.
  private file: Promise<unknown> = Promise.resolve();
  private cache = new Map<string, { jusqua: number; valeur: any }>();

  private espacer<T>(tache: () => Promise<T>): Promise<T> {
    const suite = this.file.then(async () => {
      const r = await tache();
      const pause = config.geocodeurPauseMs();
      if (pause > 0) await new Promise((ok) => setTimeout(ok, pause));
      return r;
    });
    this.file = suite.catch(() => undefined);
    return suite;
  }

  private async appeler(chemin: string, params: Record<string, string>): Promise<any | null> {
    const url = new URL(chemin, config.geocodeurUrl());
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('format', 'jsonv2'); url.searchParams.set('accept-language', 'fr');
    const cle = url.toString(), connu = this.cache.get(cle);
    if (connu && connu.jusqua > Date.now()) return connu.valeur;
    return this.espacer(async () => {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': 'RetrouvID/1.0 (prototype ESTM)' }, signal: AbortSignal.timeout(4000) });
        if (!r.ok) { this.log.warn(`géocodage : HTTP ${r.status}`); return null; }
        const valeur = await r.json();
        if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value as string);
        this.cache.set(cle, { jusqua: Date.now() + 24 * 3600 * 1000, valeur });
        return valeur;
      } catch (e: any) { this.log.warn(`géocodage indisponible : ${e.message}`); return null; }
    });
  }

  private court(x: any): string {
    const a = x.address ?? {};
    const rue = a.road ?? a.pedestrian ?? a.footway ?? a.amenity;
    const quartier = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district;
    const ville = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county;
    const morceaux = [rue, quartier, ville].filter(Boolean);
    return (morceaux.length ? morceaux.join(', ') : String(x.display_name ?? '')).slice(0, 120);
  }

  async inverse(lat: number, lng: number): Promise<{ adresse: string | null }> {
    const x = await this.appeler('/reverse', { lat: String(lat), lon: String(lng), zoom: '17', addressdetails: '1' });
    if (!x || x.error) return { adresse: null };
    const adresse = this.court(x);
    return { adresse: adresse || null };
  }

  async chercher(q: string): Promise<Lieu[]> {
    const l = await this.appeler('/search', { q, limit: '5', addressdetails: '1', countrycodes: config.geocodeurPays() });
    if (!Array.isArray(l)) return [];
    return l.map((x: any) => ({ adresse: this.court(x), lat: Number(x.lat), lng: Number(x.lon) }))
      .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
  }
}

function nombre(v: string | undefined, min: number, max: number, nom: string): number {
  const n = Number(v);
  if (v === undefined || v.trim() === '' || !Number.isFinite(n) || n < min || n > max) throw new BadRequestException(`${nom} invalide`);
  return n;
}

@Controller('geo')
export class GeoController {
  constructor(private geo: GeoService) {}

  /** Coordonnées GPS -> adresse lisible. */
  @Throttle({ default: { limit: 20, ttl: 60000 } }) @Get('inverse')
  inverse(@Query('lat') lat?: string, @Query('lng') lng?: string) {
    return this.geo.inverse(nombre(lat, -90, 90, 'Latitude'), nombre(lng, -180, 180, 'Longitude'));
  }

  /** Texte saisi -> lieux proposés, avec leurs coordonnées. */
  @Throttle({ default: { limit: 20, ttl: 60000 } }) @Get('recherche')
  async recherche(@Query('q') q = '') {
    const t = q.trim();
    if (t.length < 3 || t.length > 120) throw new BadRequestException('Saisissez entre 3 et 120 caractères');
    return { lieux: await this.geo.chercher(t) };
  }
}

@Module({ controllers: [GeoController], providers: [GeoService], exports: [GeoService] })
export class GeoModule {}
