const BASE = import.meta.env.VITE_API_URL ?? '/api';
const CLE = 'retrouvid_jeton';

export const jeton = {
  lire: () => { try { return localStorage.getItem(CLE); } catch { return null; } },
  ecrire: (t: string) => { try { localStorage.setItem(CLE, t); } catch { /* stockage indisponible */ } },
  effacer: () => { try { localStorage.removeItem(CLE); } catch { /* idem */ } },
};

export class ErreurApi extends Error { constructor(public statut: number, message: string) { super(message); } }

export async function api<T = any>(chemin: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const t = jeton.lire();
  let r: Response;
  try {
    r = await fetch(BASE + chemin, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ErreurApi(0, 'Connexion impossible. Vérifiez votre réseau et réessayez.');
  }
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const m = Array.isArray(data?.message) ? data.message.join(' · ') : data?.message;
    throw new ErreurApi(r.status, m ?? 'Une erreur est survenue.');
  }
  return data as T;
}

export type Role = 'citoyen' | 'agent' | 'admin';
export interface Compte { id: string; nom: string; prenom: string; email: string; role: Role; telephone?: string; }

export const DOCS: Record<string, { nom: string; classe: string }> = {
  cni: { nom: "Carte d'identité", classe: 'cni' },
  permis: { nom: 'Permis de conduire', classe: 'permis' },
  passeport: { nom: 'Passeport', classe: 'passeport' },
};
export const OPTIONS_DOCS: [string, string][] = Object.entries(DOCS).map(([k, v]) => [k, v.nom]);
export const ETATS_CORR: Record<string, string> = {
  en_verification: 'En vérification par un agent', validee_agent: 'À confirmer par vous', validee_citoyen: 'Paiement en attente',
  payee: 'Coordonnées disponibles', remise: 'Remis', cloturee: 'Clôturé', ecartee: 'Écartée',
};
export const ETATS_DOSSIER: Record<string, string> = { en_attente: 'En attente', en_verification: 'En vérification', remis: 'Remis', cloture: 'Clôturé' };
export const fdate = (d: string) => new Date(d).toLocaleDateString('fr-FR');

/** Récupère une image protégée et renvoie une URL locale utilisable dans <img>. */
export async function imageProtegee(chemin: string): Promise<string> {
  const t = jeton.lire();
  const r = await fetch(BASE + chemin, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
  if (!r.ok) {
    const d = await r.json().catch(() => null);
    throw new ErreurApi(r.status, d?.message ?? "Impossible d'afficher la photo.");
  }
  return URL.createObjectURL(await r.blob());
}
