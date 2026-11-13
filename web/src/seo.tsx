import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const NOM = 'RetrouvID';
const ACCUEIL = [`${NOM} : retrouver une pièce d'identité perdue au Sénégal`, "Déclarez la perte d'une carte d'identité, d'un permis ou d'un passeport, ou signalez-en un trouvé. Un agent vérifie avant toute transmission de coordonnées."] as const;

/** Titre, description et indexation de chaque écran. Les écrans de l'espace connecté ne sont pas indexés. */
const PAGES: Record<string, { t: string; d?: string; indexer?: boolean }> = {
  '/': { t: ACCUEIL[0], d: ACCUEIL[1], indexer: true },
  '/connexion': { t: `Connexion · ${NOM}`, d: 'Connectez-vous pour suivre vos déclarations et vos signalements.' },
  '/inscription': { t: `Créer un compte · ${NOM}`, d: "Un seul compte pour déclarer une perte et signaler un document trouvé. Gratuit jusqu'à la transmission des coordonnées.", indexer: true },
  '/confidentialite': { t: `Politique de confidentialité · ${NOM}`, d: 'Quelles données sont collectées, pourquoi, combien de temps, et comment exercer vos droits.', indexer: true },
  '/mentions-legales': { t: `Mentions légales · ${NOM}`, d: "Éditeur, finalité pédagogique du projet et services tiers utilisés par l'application.", indexer: true },
  '/cgu': { t: `Conditions d'utilisation · ${NOM}`, d: "Règles d'utilisation de la plateforme : déclarations de bonne foi, vérification par un agent, coordonnées et remise.", indexer: true },
  '/aide': { t: `Aide · ${NOM}` },
  '/profil': { t: `Mon profil · ${NOM}` },
  '/reglages': { t: `Réglages · ${NOM}` },
  '/notifications': { t: `Alertes · ${NOM}` },
  '/discussions': { t: `Discussions · ${NOM}` },
  '/declarer': { t: `Déclarer une perte · ${NOM}` },
  '/signaler': { t: `Signaler un document trouvé · ${NOM}` },
  '/correspondances': { t: `Correspondances · ${NOM}` },
  '/recherche': { t: `Recherche · ${NOM}` },
  '/comptes': { t: `Comptes · ${NOM}` },
  '/journal': { t: `Journal des actions · ${NOM}` },
  '/messages': { t: `Messages reçus · ${NOM}` },
};
export const PAGES_PUBLIQUES = Object.entries(PAGES).filter(([, v]) => v.indexer).map(([k]) => k);

function meta(nom: string, contenu: string, attribut: 'name' | 'property' = 'name') {
  let m = document.head.querySelector<HTMLMetaElement>(`meta[${attribut}="${nom}"]`);
  if (!m) { m = document.createElement('meta'); m.setAttribute(attribut, nom); document.head.appendChild(m); }
  m.setAttribute('content', contenu);
}

/** Met à jour <title>, la description et la consigne d'indexation à chaque changement d'écran. */
export function Seo({ introuvable = false }: { introuvable?: boolean }) {
  const { pathname } = useLocation();
  useEffect(() => {
    const p = introuvable ? undefined : PAGES[pathname] ?? (pathname.startsWith('/declarations/') ? { t: `Corriger une déclaration · ${NOM}` } : pathname.startsWith('/paiement/') ? { t: `Paiement · ${NOM}` } : undefined);
    const titre = introuvable ? `Page introuvable · ${NOM}` : p?.t ?? NOM;
    const desc = p?.d ?? ACCUEIL[1];
    document.title = titre;
    meta('description', desc); meta('og:title', titre, 'property'); meta('og:description', desc, 'property'); meta('twitter:title', titre); meta('twitter:description', desc);
    meta('robots', p?.indexer ? 'index,follow' : 'noindex,nofollow');
  }, [pathname, introuvable]);
  // le routeur ne fait pas défiler vers une ancre (#contact) : on le fait ici
  const { hash } = useLocation();
  useEffect(() => { if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }, [hash, pathname]);
  return null;
}
