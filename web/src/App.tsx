import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, Compte, jeton } from './api';
import { Accueil, Connexion, Inscription } from './pages/Auth';
import { Citoyen, NouvelleDeclaration } from './pages/Citoyen';
import { Icone, Page } from './ui';
import { NouveauSignalement } from './pages/Decouvreur';
import { Aide } from './pages/Aide';
import { RetourPaiement } from './pages/RetourPaiement';
import { Seo } from './seo';
import { Cgu, Confidentialite, Introuvable, MentionsLegales } from './pages/Legal';

// écrans chargés à la demande : le premier affichage ne télécharge pas le code de l'administrateur ni de l'agent
const Agent = lazy(() => import('./pages/Agent').then((m) => ({ default: m.Agent })));
const admin = (n: string) => lazy(() => import('./pages/Admin').then((m) => ({ default: (m as any)[n] })));
const Tableau = admin('Tableau'), AdminCorrespondances = admin('AdminCorrespondances'), AdminRecherche = admin('AdminRecherche'), AdminComptes = admin('AdminComptes'), AdminJournal = admin('AdminJournal'), AdminMessages = admin('AdminMessages');
const Notifications = lazy(() => import('./pages/Notifications').then((m) => ({ default: m.Notifications })));
const Profil = lazy(() => import('./pages/Profil').then((m) => ({ default: m.Profil })));
const Discussions = lazy(() => import('./pages/Discussions').then((m) => ({ default: m.Discussions })));
const Reglages = lazy(() => import('./pages/Reglages').then((m) => ({ default: m.Reglages })));

export interface Session { compte: Compte | null; connecter: (j: string, c: Compte) => void; }

export default function App() {
  const [compte, setCompte] = useState<Compte | null>(null);
  const [pret, setPret] = useState(false);
  const [nonLues, setNonLues] = useState(0);
  const nav = useNavigate();
  const [theme, setTheme] = useState<'clair' | 'sombre' | ''>(() => { try { return (localStorage.getItem('retrouvid_theme') as any) || ''; } catch { return ''; } });
  const { pathname } = useLocation();
  /** Le changement de thème se fait en fondu quand le navigateur sait le faire (View Transitions), sinon d'un coup. */
  function changerTheme(v: 'clair' | 'sombre' | '') {
    const calme = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fondu = (document as any).startViewTransition as undefined | ((f: () => void) => unknown);
    if (fondu && !calme) fondu.call(document, () => flushSync(() => setTheme(v))); else setTheme(v);
    try { localStorage.setItem('retrouvid_theme', v); } catch { /* stockage indisponible : le choix vaut pour cette visite */ }
  }
  const basculer = (sombreActif: boolean) => changerTheme(sombreActif ? 'clair' : 'sombre');

  useEffect(() => {
    if (!jeton.lire()) { setPret(true); return; }
    api<Compte>('/auth/moi').then(setCompte).catch(() => jeton.effacer()).finally(() => setPret(true));
  }, []);

  const compter = useCallback(() => {
    if (!jeton.lire()) return;
    api<any[]>('/notifications').then((l) => setNonLues(l.filter((n) => !n.lue).length)).catch(() => {});
  }, []);
  useEffect(() => { if (compte) { compter(); const t = setInterval(compter, 30000); return () => clearInterval(t); } }, [compte, compter]);

  function connecter(j: string, c: Compte) { jeton.ecrire(j); setCompte(c); nav('/'); }
  function majCompte(c: Compte) { setCompte({ ...compte!, ...c }); }
  function quitter() { jeton.effacer(); setCompte(null); setNonLues(0); nav('/'); }

  if (!pret) return <div className="demarrage" role="status" aria-label="Chargement"><span className="logo">Retrouv<span>ID</span></span></div>;

  type Lien = [string, string, string, boolean?]; // 4e valeur : absent de la barre du bas (mobile)
  const liens: Lien[] = !compte ? [] :
    compte.role === 'citoyen' ? [['/', 'Dossiers', 'home'], ['/declarer', 'Perdu', 'plus'], ['/signaler', 'Trouvé', 'flag'], ['/discussions', 'Discussions', 'chat']] :
    compte.role === 'agent' ? [['/', 'À vérifier', 'shield']] :
    [['/', 'Tableau de bord', 'grid'], ['/correspondances', 'Correspondances', 'link'], ['/recherche', 'Recherche', 'search'], ['/comptes', 'Comptes', 'users'], ['/journal', 'Journal', 'list'], ['/messages', 'Messages', 'inbox', true]];

  const pagesLegales = <>
    <Route path="/mentions-legales" element={<MentionsLegales />} />
    <Route path="/confidentialite" element={<Confidentialite />} />
    <Route path="/cgu" element={<Cgu />} />
  </>;
  if (!compte) return (
    <>
      <Seo />
      <Routes>
        <Route path="/" element={<Accueil />} />
        <Route path="/connexion" element={<Connexion onOk={connecter} />} />
        <Route path="/inscription" element={<Inscription onOk={connecter} />} />
        <Route path="/paiement/retour/:id" element={<Navigate to="/connexion" replace />} />
        {pagesLegales}
        <Route path="*" element={<><Seo introuvable /><Introuvable retour="Retour à l'accueil" /></>} />
      </Routes>
    </>
  );

  const mode = theme || (compte.role === 'admin' ? 'sombre' : '');
  const sombreActif = mode === 'sombre' || (mode === '' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
  const initiales = `${compte.prenom?.[0] ?? ''}${compte.nom?.[0] ?? ''}`.toUpperCase();
  const ROLES = { citoyen: 'Citoyen', agent: 'Agent vérificateur', admin: 'Administrateur' } as const;
  return (
    <div className={`app ${mode}`}>
      <Seo />
      <a className="skip" href="#contenu">Aller au contenu</a>
      <aside className="lateral">
        <Link to="/" className="logo">Retrouv<span>ID</span></Link>
        <nav className="menu" aria-label="Navigation principale">
          {liens.map(([to, l, ic]) => <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? 'actif' : '')}><Icone nom={ic} taille={20} /><span>{l}</span></NavLink>)}
        </nav>
        <div className="profil">
          <span className="avatar" aria-hidden="true">{initiales}</span>
          <div><b>{compte.prenom} {compte.nom}</b><small>{ROLES[compte.role]}</small></div>
          <button onClick={quitter} aria-label="Quitter la session" title="Quitter"><Icone nom="out" taille={20} /></button>
        </div>
      </aside>
      <div className="corps">
        <header className="haut">
          <Link to="/" className="logo logo-mobile">Retrouv<span>ID</span></Link>
          <p className="salut">Bonjour, <b>{compte.prenom}</b></p>
          <NavLink to="/aide" className="cloche" aria-label="Aide" title="Aide"><Icone nom="help" taille={20} /></NavLink>
          <NavLink to="/profil" className="cloche" aria-label="Mon profil" title="Mon profil"><Icone nom="user" taille={20} /></NavLink>
          <NavLink to="/reglages" className="cloche" aria-label="Réglages" title="Réglages"><Icone nom="cible" taille={20} /></NavLink>
          <button className="cloche" onClick={() => basculer(sombreActif)} aria-label={sombreActif ? 'Passer au thème clair' : 'Passer au thème sombre'} title={sombreActif ? 'Thème clair' : 'Thème sombre'}>
            <Icone nom={sombreActif ? 'sun' : 'moon'} taille={20} />
          </button>
          <NavLink to="/notifications" className="cloche" aria-label={nonLues ? `Alertes, ${nonLues} non lues` : 'Alertes'}>
            <Icone nom="bell" taille={20} />{nonLues > 0 && <span className="badge">{nonLues}</span>}
          </NavLink>
          <button className="quitter-haut" onClick={quitter} aria-label="Quitter la session"><Icone nom="out" taille={20} /></button>
        </header>
        <main id="contenu">
          {/* la clé relance l'animation d'entrée à chaque changement d'écran */}
          <div className="vue" key={pathname}>
          <Suspense fallback={<div className="squelette" role="status" aria-label="Chargement"><i /><i /><i /></div>}>
          <Routes>
            {compte.role === 'citoyen' && <>
              <Route path="/" element={<Citoyen compte={compte} onChange={compter} />} />
              <Route path="/declarer" element={<NouvelleDeclaration />} />
              <Route path="/signaler" element={<NouveauSignalement />} />
              <Route path="/declarations/:id/modifier" element={<NouvelleDeclaration />} />
              <Route path="/discussions" element={<Discussions />} />
              <Route path="/paiement/retour/:id" element={<RetourPaiement />} />
            </>}
            {compte.role === 'agent' && <Route path="/" element={<Agent />} />}
            {compte.role === 'admin' && <>
              <Route path="/" element={<Tableau />} />
              <Route path="/correspondances" element={<Page titre="Correspondances"><AdminCorrespondances /></Page>} />
              <Route path="/recherche" element={<Page titre="Recherche"><AdminRecherche /></Page>} />
              <Route path="/comptes" element={<Page titre="Comptes"><AdminComptes /></Page>} />
              <Route path="/journal" element={<Page titre="Journal des actions"><AdminJournal /></Page>} />
              <Route path="/messages" element={<Page titre="Messages reçus"><AdminMessages /></Page>} />
            </>}
            <Route path="/aide" element={<Aide compte={compte} />} />
            <Route path="/profil" element={<Profil compte={compte} onMaj={majCompte} />} />
            <Route path="/reglages" element={<Reglages compte={compte} onMaj={majCompte} theme={theme} onTheme={changerTheme} />} />
            <Route path="/notifications" element={<Notifications onChange={compter} />} />
            {pagesLegales}
            <Route path="*" element={<><Seo introuvable /><Introuvable retour={compte.role === 'admin' ? 'Retour au tableau de bord' : compte.role === 'agent' ? 'Retour aux correspondances' : 'Retour à mes dossiers'} /></>} />
          </Routes>
          </Suspense>
          </div>
        </main>
      </div>
      <nav className="bas" aria-label="Navigation mobile">
        {liens.filter((x) => !x[3]).map(([to, l, ic]) => <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? 'actif' : '')}><Icone nom={ic} taille={22} /><span>{l.replace('Tableau de bord', 'Tableau').replace('Correspondances', 'Corresp.')}</span></NavLink>)}
      </nav>
    </div>
  );
}
