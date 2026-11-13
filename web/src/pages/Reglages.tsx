import { useEffect, useState } from 'react';
import { Compte } from '../api';
import { Alerte, Icone } from '../ui';
import { ChangerMotDePasse, FormProfil } from './Profil';

type Onglet = 'general' | 'securite' | 'apparence' | 'application';
const ONGLETS: [Onglet, string][] = [['general', 'Général'], ['securite', 'Mot de passe'], ['apparence', 'Apparence'], ['application', 'Application']];
type Theme = 'clair' | 'sombre' | '';

/** Événement non standard de Chrome et d'Edge : Safari et Firefox ne l'émettent pas. */
interface InvitationInstall extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>; }

function Application() {
  const [invite, setInvite] = useState<InvitationInstall | null>(null);
  const [installee, setInstallee] = useState(() => typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
  const [enLigne, setEnLigne] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const avant = (e: Event) => { e.preventDefault(); setInvite(e as InvitationInstall); };
    const fait = () => { setInstallee(true); setInvite(null); };
    const on = () => setEnLigne(true), off = () => setEnLigne(false);
    window.addEventListener('beforeinstallprompt', avant); window.addEventListener('appinstalled', fait);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('beforeinstallprompt', avant); window.removeEventListener('appinstalled', fait); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  async function installer() {
    if (!invite) return;
    await invite.prompt();
    const r = await invite.userChoice;
    setMsg(r.outcome === 'accepted' ? "Installation lancée. L'icône RetrouvID apparaît sur votre appareil." : "Installation refusée. Vous pourrez la relancer ici.");
    setInvite(null);
  }
  return (
    <div className="cote carte">
      <h2>Application</h2>
      <p className="ligne"><Icone nom={enLigne ? 'check' : 'out'} />{enLigne ? 'Vous êtes connecté à Internet.' : "Vous êtes hors ligne : les écrans déjà ouverts restent lisibles, mais aucune démarche ne peut être enregistrée."}</p>
      {installee ? <Alerte type="ok">RetrouvID est installée sur cet appareil.</Alerte> :
        invite ? <button className="btn p" onClick={installer}><Icone nom="download" />Installer RetrouvID</button> :
        <Alerte type="info">L'installation se propose ici quand le navigateur la permet. Sinon, utilisez son menu : « Ajouter à l'écran d'accueil » sur Safari (iPhone), « Installer l'application » sur Chrome et Edge.</Alerte>}
      {msg && <p className="muted petit" role="status">{msg}</p>}
      <p className="muted petit">La position GPS et les cartes demandent une connexion. La position n'est lue qu'au moment où vous appuyez sur « Utiliser ma position actuelle ».</p>
    </div>
  );
}

export function Reglages({ compte, onMaj, theme, onTheme }: { compte: Compte & { telephone?: string }; onMaj: (c: Compte) => void; theme: Theme; onTheme: (t: Theme) => void }) {
  const [o, setO] = useState<Onglet>('general');
  const CHOIX: [Theme, string, string][] = [['', 'Automatique', 'Suit le réglage de votre appareil'], ['clair', 'Clair', 'Fond clair en toute situation'], ['sombre', 'Sombre', 'Fond sombre, moins éblouissant le soir']];
  return (
    <>
      <h1 className="titre-page">Réglages</h1>
      <div className="onglets" role="tablist" aria-label="Rubriques des réglages">
        {ONGLETS.map(([k, t]) => <button key={k} role="tab" aria-selected={o === k} className={o === k ? 'actif' : ''} onClick={() => setO(k)}>{t}</button>)}
      </div>
      {o === 'general' && <FormProfil compte={compte} onMaj={onMaj} />}
      {o === 'securite' && <ChangerMotDePasse />}
      {o === 'apparence' && (
        <fieldset className="cote carte choix-theme">
          <legend>Thème</legend>
          {CHOIX.map(([v, t, d]) => (
            <label key={t}><input type="radio" name="theme" checked={theme === v} onChange={() => onTheme(v)} /><span><b>{t}</b><small>{d}</small></span></label>
          ))}
        </fieldset>
      )}
      {o === 'application' && <Application />}
    </>
  );
}
