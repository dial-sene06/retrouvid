import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { PAGES_PUBLIQUES } from './seo';

type Choix = 'accepte' | 'refuse' | null;
const CLE = 'retrouvid_consentement';
/** Identifiant de mesure d'audience (Google Analytics 4). Vide : aucun outil de mesure n'est chargé. */
export const ID_MESURE: string = (import.meta.env.VITE_GA_ID as string | undefined) ?? '';

function lire(): Choix { try { const v = localStorage.getItem(CLE); return v === 'accepte' || v === 'refuse' ? v : null; } catch { return null; } }
function ecrire(v: Choix) { try { v ? localStorage.setItem(CLE, v) : localStorage.removeItem(CLE); } catch { /* stockage indisponible : le choix vaut pour cette visite */ } }

interface Ctx { choix: Choix; decider: (c: 'accepte' | 'refuse') => void; rouvrir: () => void; ouvert: boolean }
const Contexte = createContext<Ctx>({ choix: null, decider: () => {}, rouvrir: () => {}, ouvert: false });
export const useConsentement = () => useContext(Contexte);

declare global { interface Window { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void } }

function chargerMesure() {
  if (!ID_MESURE || window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer!.push(arguments); };
  window.gtag('js', new Date());
  // pas de page_view automatique : seules les pages publiques sont comptées (voir Audience)
  window.gtag('config', ID_MESURE, { anonymize_ip: true, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement('script'); s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ID_MESURE)}`;
  document.head.appendChild(s);
}

export function Consentement({ children }: { children: ReactNode }) {
  const [choix, setChoix] = useState<Choix>(lire);
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => { if (choix === 'accepte') chargerMesure(); }, [choix]);
  const decider = useCallback((c: 'accepte' | 'refuse') => { ecrire(c); setChoix(c); setOuvert(false); }, []);
  const rouvrir = useCallback(() => setOuvert(true), []);
  return <Contexte.Provider value={{ choix, decider, rouvrir, ouvert }}>{children}</Contexte.Provider>;
}

/** Compte les pages publiques vues, avec l'accord de la personne. Jamais dans l'espace connecté : les adresses y contiennent des identifiants de dossier. */
export function Audience() {
  const { choix } = useConsentement();
  const { pathname } = useLocation();
  useEffect(() => {
    if (choix !== 'accepte' || !ID_MESURE || !PAGES_PUBLIQUES.includes(pathname)) return;
    window.gtag?.('event', 'page_view', { page_path: pathname, page_title: document.title });
  }, [choix, pathname]);
  return null;
}

export function BanniereCookies() {
  const { choix, decider, ouvert } = useConsentement();
  if (choix !== null && !ouvert) return null;
  const mesure = !!ID_MESURE;
  return (
    <div className="cookies" role="dialog" aria-modal="false" aria-labelledby="cookies-t">
      <h2 id="cookies-t">Votre appareil et vos données</h2>
      <p>
        RetrouvID garde sur votre appareil le strict nécessaire : votre session de connexion, votre choix de thème et ce choix-ci.
        {mesure ? ' Avec votre accord, nous comptons aussi les visites des pages publiques (accueil, aide, pages légales), sans lire votre espace connecté.' : ' Aucun outil de mesure ni publicité n\'est installé.'}{' '}
        <Link to="/confidentialite#stockage">En savoir plus</Link>
      </p>
      <div className="ligne">
        {mesure ? <>
          <button className="btn s" onClick={() => decider('refuse')}>Refuser</button>
          <button className="btn s" onClick={() => decider('accepte')}>Accepter</button>
        </> : <button className="btn s" onClick={() => decider('refuse')}>J'ai compris</button>}
      </div>
    </div>
  );
}
