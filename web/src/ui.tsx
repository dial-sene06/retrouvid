import { ReactNode, useEffect, useState } from 'react';
import { DOCS, imageProtegee } from './api';

const ICONES: Record<string, string> = {
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  tel: 'M7 3h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 5 5a2 2 0 0 1 2-2Z',
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  plus: 'M12 5v14M5 12h14',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M17 4a3.5 3.5 0 0 1 0 7M18 14a7 7 0 0 1 4 6',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  out: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  up: 'M7 17L17 7M9 7h8v8',
  down: 'M7 7l10 10M17 9v8H9',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 10c0-1.5 1.3-2 3-2s3 .7 3 2-1.3 1.6-3 2-3 .6-3 2 1.3 2 3 2 3-.5 3-2',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5',
  check: 'M5 12l5 5 9-10',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  cible: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01',
  chat: 'M4 5h16v11H9l-5 4z',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  send: 'M4 12l16-8-6 16-3-7z',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  inbox: 'M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5',
};
export function Icone({ nom, taille = 18 }: { nom: string; taille?: number }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" width={taille} height={taille} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONES[nom]} />
    </svg>
  );
}
export function Champ({ id, label, aide, icone, ...p }: { id: string; label: string; aide?: string; icone?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="champ">
      <label htmlFor={id}>{label}</label>
      {icone ? <div className="avec-ic"><input id={id} {...p} /><Icone nom={icone} /></div> : <input id={id} {...p} />}
      {aide && <small>{aide}</small>}
    </div>
  );
}
export function MotDePasse({ id, label, aide, ...p }: { id: string; label: string; aide?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [vu, setVu] = useState(false);
  return (
    <div className="champ">
      <label htmlFor={id}>{label}</label>
      <div className="mdp">
        <input id={id} {...p} type={vu ? 'text' : 'password'} />
        <button type="button" onClick={() => setVu(!vu)} aria-pressed={vu}>{vu ? 'Masquer' : 'Afficher'}</button>
      </div>
      {aide && <small>{aide}</small>}
    </div>
  );
}
export function Liste({ id, label, options, ...p }: { id: string; label: string; options: [string, string][] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="champ">
      <label htmlFor={id}>{label}</label>
      <select id={id} {...p}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </div>
  );
}
export const Alerte = ({ type = 'err', children }: { type?: 'err' | 'ok' | 'info' | 'warn'; children: ReactNode }) =>
  <div className={`alerte ${type}`} role={type === 'err' ? 'alert' : 'status'}>{children}</div>;

export const Puce = ({ children, ton }: { children: ReactNode; ton?: string }) => <span className={`puce ${ton ?? ''}`}>{children}</span>;
export const Doc = ({ type }: { type: string }) => <span className={`doc ${DOCS[type]?.classe}`}><i />{DOCS[type]?.nom ?? type}</span>;
export const Vide = ({ children }: { children: ReactNode }) => <div className="vide">{children}</div>;

/** Bouton qui désactive pendant l'appel et affiche l'erreur éventuelle. */
export function Action({ children, onClick, ton = 'p', confirmer }: { children: ReactNode; onClick: () => Promise<unknown>; ton?: 'p' | 's'; confirmer?: string }) {
  const [occupe, setOccupe] = useState(false);
  const [att, setAtt] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    setOccupe(true); setErr('');
    try { await onClick(); } catch (e: any) { setErr(e.message); } finally { setOccupe(false); setAtt(false); }
  }
  if (att && confirmer) return (
    <div className="confirmer" role="group" aria-label="Confirmation">
      <p>{confirmer}</p>
      <button className="btn p" disabled={occupe} onClick={go}>Oui, continuer</button>
      <button className="btn s" onClick={() => setAtt(false)}>Annuler</button>
    </div>
  );
  return (
    <>
      <button className={`btn ${ton}`} disabled={occupe} onClick={() => (confirmer ? setAtt(true) : go())}>{occupe ? 'Patientez…' : children}</button>
      {err && <Alerte>{err}</Alerte>}
    </>
  );
}

export const Page = ({ titre, children }: { titre: string; children: ReactNode }) =>
  <><div className="entete-page"><h1>{titre}</h1></div>{children}</>;

/** Réduit la photo avant l'envoi : 1280 px de large au plus, JPEG. Un cliché de téléphone passe de plusieurs Mo à environ 200 Ko. */
function reduire(fichier: File): Promise<string> {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(fichier), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error("Ce fichier n'est pas une image lisible.")); };
    img.src = url;
  });
}

/** Prise de photo (appareil de l'appareil sur mobile) ou choix d'un fichier. Renvoie une data URL JPEG. */
export function Photo({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  const [err, setErr] = useState('');
  async function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setErr('');
    try { onChange(await reduire(f)); } catch (x: any) { setErr(x.message); }
  }
  return (
    <div className="champ photo">
      <label>Photo du document (facultatif)</label>
      {valeur ? (
        <div className="photo-apercu"><img src={valeur} alt="Aperçu de la photo du document" />
          <button type="button" className="btn s" onClick={() => onChange('')}>Retirer la photo</button></div>
      ) : (
        <div className="ligne">
          <label className="btn s photo-btn"><Icone nom="camera" />Prendre une photo<input type="file" accept="image/*" capture="environment" onChange={choisir} hidden /></label>
          <label className="btn s photo-btn"><Icone nom="image" />Choisir un fichier<input type="file" accept="image/*" onChange={choisir} hidden /></label>
        </div>
      )}
      <small>Cadrez le document bien à plat, texte lisible. Seuls les agents et l'administration peuvent la voir, et elle est effacée à la clôture du dossier.</small>
      {err && <Alerte>{err}</Alerte>}
    </div>
  );
}

/** Affiche une photo protégée à la demande : chaque ouverture est enregistrée dans le journal côté serveur. */
export function PhotoVue({ chemin }: { chemin: string }) {
  const [url, setUrl] = useState(''); const [err, setErr] = useState(''); const [occupe, setOccupe] = useState(false);
  async function voir() { setOccupe(true); setErr(''); try { setUrl(await imageProtegee(chemin)); } catch (x: any) { setErr(x.message); } finally { setOccupe(false); } }
  if (url) return <div className="photo-apercu"><img src={url} alt="Photo du document trouvé" /><button className="btn s" onClick={() => { URL.revokeObjectURL(url); setUrl(''); }}>Masquer la photo</button></div>;
  return <>
    <button type="button" className="btn s" disabled={occupe} onClick={voir}><Icone nom="camera" />{occupe ? 'Chargement…' : 'Voir la photo'}</button>
    {err && <Alerte>{err}</Alerte>}
  </>;
}

const mouvementReduit = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fait monter un nombre de 0 à sa valeur en 0,7 s. Sans animation si le système demande moins de mouvement. */
export function useCompteur(cible: number | string) {
  const fin = typeof cible === 'number' && Number.isFinite(cible) ? cible : null;
  const [n, setN] = useState(fin === null || mouvementReduit() ? fin : 0);
  useEffect(() => {
    if (fin === null || mouvementReduit() || typeof requestAnimationFrame !== 'function') { setN(fin); return; }
    let id = 0; const debut = performance.now(), duree = 700;
    const pas = (t: number) => {
      const p = Math.min(1, (t - debut) / duree);
      setN(Math.round(fin * (1 - Math.pow(1 - p, 3))));
      if (p < 1) id = requestAnimationFrame(pas);
    };
    id = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(id);
  }, [fin]);
  return fin === null ? cible : n;
}

/** Grand chiffre animé de la page d'accueil (bandeau des chiffres). */
export const Compteur = ({ valeur }: { valeur: number | string }) => <b className="chiffre">{useCompteur(valeur)}</b>;

/** Révèle les blocs « .revele » d'une page quand ils entrent à l'écran (classe « vu »). */
export function useRevelation() {
  useEffect(() => {
    const blocs = Array.from(document.querySelectorAll<HTMLElement>('.revele:not(.vu)'));
    if (typeof IntersectionObserver !== 'function' || mouvementReduit()) { blocs.forEach((b) => b.classList.add('vu')); return; }
    const obs = new IntersectionObserver((vus) => vus.forEach((v) => { if (v.isIntersecting) { v.target.classList.add('vu'); obs.unobserve(v.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    blocs.forEach((b) => obs.observe(b));
    return () => obs.disconnect();
  });
}

/** Carte de chiffre : mêmes classes que le tableau de bord de l'administrateur. */
export function Stat({ icone, titre, valeur }: { icone: string; titre: string; valeur: number | string }) {
  const n = useCompteur(valeur);
  return (
    <div className="carte kpi-carte">
      <div className="kpi-tete"><span className="kpi-ic"><Icone nom={icone} taille={20} /></span><span className="kpi-titre">{titre}</span></div>
      <b className="kpi-n">{n}</b>
    </div>
  );
}

/** Invite d'installation de la PWA : le navigateur n'émet l'événement que si l'application est installable. */
export function useInstall() {
  const [evt, setEvt] = useState<any>(null);
  const [fait, setFait] = useState(false);
  useEffect(() => {
    const avant = (e: Event) => { e.preventDefault(); setEvt(e); };
    const apres = () => { setFait(true); setEvt(null); };
    window.addEventListener('beforeinstallprompt', avant); window.addEventListener('appinstalled', apres);
    return () => { window.removeEventListener('beforeinstallprompt', avant); window.removeEventListener('appinstalled', apres); };
  }, []);
  const installee = fait || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
  return { peut: !!evt && !installee, installee, installer: async () => { if (!evt) return; evt.prompt(); await evt.userChoice.catch(() => null); setEvt(null); } };
}
