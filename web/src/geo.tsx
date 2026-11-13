import { useState } from 'react';
import { api } from './api';
import { Alerte, Champ, Icone } from './ui';

export interface Pt { lat: number; lng: number }
const arrondir = (n: number) => Math.round(n * 1e5) / 1e5;

/** Carte OpenStreetMap intégrée (iframe) : aucune bibliothèque cartographique à embarquer dans la PWA. */
export function CarteOsm({ pos, titre }: { pos: Pt; titre: string }) {
  const d = 0.004;
  const bbox = [pos.lng - d, pos.lat - d, pos.lng + d, pos.lat + d].join(',');
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${pos.lat}%2C${pos.lng}`;
  return (
    <div className="carte-osm">
      <iframe title={titre} src={src} loading="lazy" referrerPolicy="no-referrer" />
      <a href={`https://www.openstreetmap.org/?mlat=${pos.lat}&mlon=${pos.lng}#map=17/${pos.lat}/${pos.lng}`} target="_blank" rel="noopener noreferrer">Ouvrir dans OpenStreetMap</a>
    </div>
  );
}

export const distanceTexte = (km: number | null | undefined) =>
  km == null ? '' : km < 1 ? 'moins d\'1 km' : `environ ${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`;

/**
 * Champ « lieu » avec position facultative : GPS de l'appareil, ou recherche d'adresse.
 * Le géocodage passe par le serveur (/geo). S'il est injoignable, les coordonnées restent utilisables.
 */
export function ChampLieu({ id, label, valeur, onValeur, pos, onPos }: {
  id: string; label: string; valeur: string; onValeur: (v: string) => void; pos: Pt | null; onPos: (p: Pt | null) => void;
}) {
  const [msg, setMsg] = useState<{ type: 'err' | 'info'; texte: string } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [choix, setChoix] = useState<{ adresse: string; lat: number; lng: number }[]>([]);
  const gps = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  async function adresseDe(p: Pt) {
    try {
      const r = await api<{ adresse: string | null }>(`/geo/inverse?lat=${p.lat}&lng=${p.lng}`);
      onValeur(r.adresse ?? `Position GPS (${p.lat}, ${p.lng})`);
      if (!r.adresse) setMsg({ type: 'info', texte: "L'adresse n'a pas pu être déterminée. Les coordonnées sont enregistrées, vous pouvez préciser le lieu à la main." });
    } catch { onValeur(valeur || `Position GPS (${p.lat}, ${p.lng})`); }
  }

  function localiser() {
    setMsg(null); setChoix([]); setOccupe(true);
    navigator.geolocation.getCurrentPosition(
      async (r) => {
        const p = { lat: arrondir(r.coords.latitude), lng: arrondir(r.coords.longitude) };
        onPos(p); await adresseDe(p); setOccupe(false);
        if (r.coords.accuracy > 300) setMsg({ type: 'info', texte: `Position peu précise (environ ${Math.round(r.coords.accuracy)} m). Vérifiez-la sur la carte.` });
      },
      (e) => {
        setOccupe(false);
        setMsg({ type: 'err', texte: e.code === 1 ? "Localisation refusée. Autorisez-la dans le navigateur, ou saisissez le lieu et lancez une recherche." : "Position introuvable pour le moment. Saisissez le lieu et lancez une recherche." });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  async function chercher() {
    setMsg(null); setChoix([]);
    if (valeur.trim().length < 3) return setMsg({ type: 'err', texte: 'Saisissez au moins 3 caractères avant de chercher.' });
    setOccupe(true);
    try {
      const r = await api<{ lieux: { adresse: string; lat: number; lng: number }[] }>(`/geo/recherche?q=${encodeURIComponent(valeur.trim())}`);
      if (r.lieux.length === 0) setMsg({ type: 'info', texte: 'Aucun lieu trouvé. Le texte saisi est conservé tel quel, la position reste facultative.' });
      setChoix(r.lieux);
    } catch (x: any) { setMsg({ type: 'err', texte: x.message }); } finally { setOccupe(false); }
  }

  return (
    <div className="lieu">
      <Champ id={id} label={label} required value={valeur} onChange={(e) => onValeur(e.target.value)} />
      <div className="ligne">
        {gps && <button type="button" className="btn s" disabled={occupe} onClick={localiser}><Icone nom="cible" />Utiliser ma position actuelle</button>}
        <button type="button" className="btn s" disabled={occupe} onClick={chercher}><Icone nom="search" />Chercher ce lieu</button>
      </div>
      {msg && <Alerte type={msg.type}>{msg.texte}</Alerte>}
      {choix.length > 0 && (
        <ul className="choix-lieu" aria-label="Lieux trouvés">
          {choix.map((c, i) => (
            <li key={i}><button type="button" onClick={() => { onValeur(c.adresse); onPos({ lat: arrondir(c.lat), lng: arrondir(c.lng) }); setChoix([]); }}><Icone nom="pin" />{c.adresse}</button></li>
          ))}
        </ul>
      )}
      {pos && <>
        <CarteOsm pos={pos} titre="Position choisie" />
        <p className="petit muted">Position enregistrée ({pos.lat}, {pos.lng}). Elle n'est montrée qu'aux agents, puis à l'autre personne après validation, et effacée à la clôture.
          {' '}<button type="button" className="lien-bouton" onClick={() => onPos(null)}>Retirer la position</button></p>
      </>}
    </div>
  );
}
