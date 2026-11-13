/** Distance à vol d'oiseau entre deux points GPS (formule de haversine), en kilomètres, arrondie à 0,1. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** Les deux coordonnées vont ensemble : une moitié de position est refusée. */
export function position(d: { lat?: number; lng?: number }): { lat: number | null; lng: number | null } {
  const a = d.lat ?? null, b = d.lng ?? null;
  if ((a === null) !== (b === null)) throw new Error('POSITION_INCOMPLETE');
  return { lat: a, lng: b };
}

export function pointDe(x: { lat: number | null; lng: number | null }) {
  return x.lat === null || x.lng === null ? null : { lat: x.lat, lng: x.lng };
}
