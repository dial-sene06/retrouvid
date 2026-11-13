import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Compte, fdate } from '../api';
import { Alerte, Champ, Compteur, Icone, MotDePasse, Titre, useInstall, useRevelation } from '../ui';
import { Faq, FormContact } from './Aide';
import { EnTeteSite, PiedSite } from './Legal';
import { Rubans } from '../rubans';

const NOMS_DOC: Record<string, string> = { cni: "Carte d'identité", permis: 'Permis de conduire', passeport: 'Passeport' };

const ETAPES_PARCOURS = [
  { n: '01', titre: 'Vous déclarez la perte', texte: 'Type de document, numéro, lieu et date. Le lieu peut être placé sur une carte si vous le souhaitez.' },
  { n: '02', titre: 'Un agent vérifie', texte: "Il compare des valeurs partiellement masquées. Rien n'est transmis tant que la correspondance n'est pas validée." },
  { n: '03', titre: 'Vous récupérez votre pièce', texte: "Vous obtenez les coordonnées de la personne qui l'a trouvée, puis vous confirmez la remise tous les deux." },
];

/**
 * « Comment ça marche » en défilement immersif : le panneau sombre reste à l'écran pendant que les étapes 01, 02, 03
 * se succèdent au fil du défilement, sur fond de fils lumineux. Sans animation (mouvement réduit), les trois étapes
 * s'affichent l'une sous l'autre. Les trois textes restent dans la page : un lecteur d'écran les lit tous.
 */
function ParcoursImmersif() {
  const ref = useRef<HTMLElement>(null);
  const [actif, setActif] = useState(0);
  const [calme] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    if (calme) return;
    let image = 0;
    const maj = () => {
      image = 0;
      const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect(), course = r.height - window.innerHeight;
      const avance = course > 0 ? Math.min(1, Math.max(0, -r.top / course)) : 0;
      el.style.setProperty('--avance', avance.toFixed(4));
      setActif(Math.min(ETAPES_PARCOURS.length - 1, Math.floor(avance * ETAPES_PARCOURS.length)));
    };
    const planifier = () => { if (!image) image = requestAnimationFrame(maj); };
    // la page d'accueil défile dans un conteneur, pas dans la fenêtre : on écoute le défilement de n'importe quel élément
    document.addEventListener('scroll', planifier, { capture: true, passive: true });
    window.addEventListener('resize', planifier);
    maj();
    return () => { document.removeEventListener('scroll', planifier, { capture: true }); window.removeEventListener('resize', planifier); cancelAnimationFrame(image); };
  }, [calme]);

  return (
    <section ref={ref} className={`immersif${calme ? ' calme' : ''}`} id="fonctionnement" aria-labelledby="titre-fonctionnement">
      <div className="immersif-colle">
        <Rubans forme="croix" />
        <div className="immersif-contenu">
          <div>
            <span className="surtitre">Comment ça marche</span>
            <Titre id="titre-fonctionnement" texte="Trois étapes, aucune" etiquette="donnée exposée" />
          </div>
          <ol className="immersif-etapes">
            {ETAPES_PARCOURS.map((e, i) => (
              <li key={e.n} className={i === actif ? 'actif' : i < actif ? 'passe' : ''} aria-current={i === actif ? 'step' : undefined}>
                <span className="immersif-num" aria-hidden="true">{e.n}</span>
                <div><h3>{e.titre}</h3><p>{e.texte}</p></div>
              </li>
            ))}
          </ol>
          <div className="immersif-jauge" aria-hidden="true">
            {ETAPES_PARCOURS.map((e, i) => <i key={e.n} style={{ '--n': i } as React.CSSProperties} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Garanties de la plateforme, affichées en grille avec une tuile d'icône colorée. */
const ATOUTS = [
  { icone: 'shield', ton: 'menthe', titre: 'Données masquées', texte: "Le numéro et le nom du document ne sont jamais affichés en clair au public. L'agent ne voit qu'une partie des valeurs." },
  { icone: 'users', ton: 'sable', titre: 'Un agent vérifie', texte: 'Chaque rapprochement proposé par la plateforme est contrôlé par un agent avant toute mise en relation.' },
  { icone: 'coin', ton: 'ciel', titre: 'Paiement mobile', texte: 'La mise en relation se règle par Wave ou Orange Money, sans carte bancaire.' },
  { icone: 'bell', ton: 'ciel', titre: 'Alerte à chaque étape', texte: 'Vous êtes prévenu dès qu’un document correspondant est signalé, validé, puis remis.' },
  { icone: 'trash', ton: 'menthe', titre: 'Effacé à la clôture', texte: 'Une fois la pièce rendue, le numéro, le nom, la photo, les messages et les positions sont supprimés.' },
  { icone: 'download', ton: 'sable', titre: 'Installable', texte: "RetrouvID s'ajoute à l'écran d'accueil du téléphone, comme une application, sans passer par un magasin." },
] as const;

/** Bandeaux inclinés qui se croisent et défilent en sens contraires. */
function BandesCroisees() {
  const piste = (mots: string[]) => [...mots, ...mots].map((m, i) => <span key={i}>{m}<i>✱</i></span>);
  return (
    <div className="bandes" aria-hidden="true">
      <div className="bande bande-1"><div className="bande-piste">{piste(['Déclarer', 'Signaler', 'Vérifier', 'Payer', 'Récupérer'])}</div></div>
      <div className="bande bande-2"><div className="bande-piste">{piste(["Carte d'identité", 'Permis de conduire', 'Passeport', 'Partout au Sénégal'])}</div></div>
    </div>
  );
}

/** Mini-documents qui flottent autour du titre d'accueil (valeurs fictives et masquées). */
function Ambiance() {
  return (
    <div className="scene-ambiance" aria-hidden="true">
      <div className="doc-flottant doc-cni"><span className="doc-type">Carte d'identité</span><span className="doc-puce" /><span className="doc-num">1 75 •••• •• 4821</span><span className="doc-lignes"><i /><i /></span></div>
      <div className="doc-flottant doc-permis"><span className="doc-type">Permis de conduire</span><span className="doc-puce" /><span className="doc-num">SN-••••-307</span><span className="doc-lignes"><i /><i /></span></div>
      <div className="doc-flottant doc-passeport"><span className="doc-type">Passeport</span><span className="doc-embleme" /><span className="doc-num">A•••••19</span></div>
      <div className="statut-flottant"><span className="statut-ic"><Icone nom="check" taille={16} /></span><span><b>Correspondance vérifiée</b><small>par un agent</small></span></div>
    </div>
  );
}

export function Accueil() {
  const [stats, setStats] = useState<{ declarations: number; signalements: number; restitues: number; recents: { type_document: string; date: string }[] } | null>(null);
  const inst = useInstall();
  useRevelation();
  useEffect(() => { api('/public/stats').then(setStats).catch(() => setStats(null)); }, []);
  // arrivée depuis un lien « /#aide » d'une autre page : la section n'existe qu'après le rendu, on y descend ensuite
  useEffect(() => {
    const cible = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    if (cible) requestAnimationFrame(() => cible.scrollIntoView());
  }, []);
  return (
    <div className="auth auth-accueil">
      <EnTeteSite accueil />
      <main id="contenu" className="scene">
        <Ambiance />
        <div className="scene-contenu">
          <p className="scene-pastille"><span className="point-vivant" />Pièces d'identité perdues · Sénégal</p>
          <Titre niveau={1} texte="Retrouvez votre pièce d'identité" etiquette="en sécurité." />
          <p className="scene-intro">Déclarez la perte de votre carte d'identité, de votre permis ou de votre passeport. Si quelqu'un l'a trouvé, un agent vérifie la correspondance avant que vous ne receviez ses coordonnées.</p>
          <div className="ligne scene-actions">
            <Link className="btn clair p" to="/inscription">Créer un compte</Link>
            <Link className="btn clair s" to="/connexion">Se connecter</Link>
          </div>
        </div>
      </main>

      <div className="accueil-suite" role="region" aria-label="Présentation du service">
        {stats && (
          <section className="chiffres revele" aria-label="Chiffres de la plateforme">
            <div><Compteur valeur={stats.declarations} /><p>pertes déclarées par des citoyens sur la plateforme</p></div>
            <div><Compteur valeur={stats.signalements} /><p>documents trouvés et signalés par des personnes de bonne foi</p></div>
            <div><Compteur valeur={stats.restitues} /><p>pièces rendues à leur propriétaire après vérification</p></div>
          </section>
        )}

        <section className="bloc revele" aria-labelledby="titre-atouts">
          <div className="tete-centre">
            <Titre id="titre-atouts" texte="Pourquoi" etiquette="RetrouvID" ton="sable" />
            <p>Ce qui protège chaque dossier, de la déclaration à la remise.</p>
          </div>
          <div className="atouts">
            {ATOUTS.map((a, i) => (
              <article key={a.titre} className="atout" style={{ '--i': i } as React.CSSProperties}>
                <span className="tuile" data-ton={a.ton}><Icone nom={a.icone} taille={22} /></span>
                <h3>{a.titre}</h3>
                <p>{a.texte}</p>
              </article>
            ))}
          </div>
        </section>

        <BandesCroisees />

        <ParcoursImmersif />

        <section className="bloc revele" id="services">
          <div className="tete-centre">
            <Titre texte="Ce que vous pouvez" etiquette="faire" ton="ciel" />
            <p>Un seul compte sert à déclarer une perte comme à signaler un document trouvé.</p>
          </div>
          <div className="grille services">
            <article className="carte service">
              <span className="tuile" data-ton="menthe"><Icone nom="search" taille={22} /></span>
              <span className="surtitre">Perte</span>
              <h3>J'ai perdu un document</h3>
              <p>Vous décrivez la perte et suivez chaque étape depuis votre espace. Vous êtes prévenu à chaque changement.</p>
              <Link className="lien-fleche" to="/inscription">Déclarer une perte<Icone nom="up" /></Link>
            </article>
            <article className="carte service">
              <span className="tuile" data-ton="sable"><Icone nom="flag" taille={22} /></span>
              <span className="surtitre">Trouvaille</span>
              <h3>J'ai trouvé un document</h3>
              <p>Vous le signalez avec une photo facultative. Votre nom et votre téléphone ne sont transmis qu'après vérification.</p>
              <Link className="lien-fleche" to="/inscription">Signaler un document<Icone nom="up" /></Link>
            </article>
            <article className="carte service">
              <span className="tuile" data-ton="ciel"><Icone nom="shield" taille={22} /></span>
              <span className="surtitre">Vérification</span>
              <h3>Un agent contrôle</h3>
              <p>Il compare les valeurs masquées, la distance entre les deux lieux et, si elle existe, la photo. Il valide ou il écarte.</p>
              <a className="lien-fleche" href="#confidentialite">Nos garanties<Icone nom="up" /></a>
            </article>
          </div>
        </section>

        <section className="dialogue revele" aria-labelledby="titre-dialogue">
          <p className="note note-g"><b>Vous :</b>J'ai perdu ma carte d'identité dans un taxi. Par où commencer ?</p>
          <p className="note note-d"><b>RetrouvID :</b>Déclarez la perte une fois. Dès qu'un document correspondant est signalé et vérifié, vous êtes prévenu.</p>
          <Titre id="titre-dialogue" texte="Une perte, une alerte," etiquette="une remise." ton="menthe" />
          <p className="dialogue-texte">Vous n'avez pas à surveiller les réseaux sociaux : la plateforme compare chaque nouveau signalement à votre déclaration.</p>
          <Link className="btn p" to="/inscription">Déclarer une perte</Link>
        </section>

        <section className="bloc bloc-duo revele" id="confidentialite">
          <div>
            <span className="surtitre">Confidentialité</span>
            <Titre texte="Vos données restent" etiquette="protégées" ton="menthe" />
            <ul className="points">
              <li>Le numéro et le nom du document sont masqués pour tous, sauf à l'agent qui compare, et en partie seulement.</li>
              <li>Vos coordonnées ne sont transmises qu'après validation de l'agent, confirmation du propriétaire et paiement.</li>
              <li>La position GPS est facultative et n'est jamais montrée au grand public.</li>
              <li>À la clôture du dossier, le numéro, le nom, la photo, les messages et les positions sont effacés.</li>
            </ul>
          </div>
          <div id="restitues">
            <span className="surtitre">En direct</span>
            <Titre texte="Derniers documents" etiquette="restitués" ton="sable" />
            {stats && stats.recents.length > 0 ? (
              <ul className="recents">
                {stats.recents.map((r, i) => (
                  <li key={i}><Icone nom="check" /><span><b>{NOMS_DOC[r.type_document] ?? r.type_document}</b> remis à son propriétaire</span><small>{fdate(r.date)}</small></li>
                ))}
              </ul>
            ) : <p className="muted">Aucune restitution enregistrée pour l'instant. Les nouvelles apparaîtront ici, sans nom ni numéro.</p>}
          </div>
        </section>

        <section className="bloc revele" id="aide">
          <div className="tete-centre"><Titre texte="Questions" etiquette="fréquentes" ton="ciel" /></div>
          <div className="carte"><Faq /></div>
        </section>

        <section className="bande-contact revele" id="contact">
          <Rubans forme="vague" />
          <div className="bande-texte">
            <Titre texte="Une" etiquette="question ?" ton="sable" />
            <p>Écrivez-nous. Le message arrive chez l'administrateur de la plateforme, qui vous répond par e-mail.</p>
            {(inst.peut || inst.installee) && (
              <p>{inst.peut
                ? <button className="btn s clair" onClick={inst.installer}><Icone nom="download" />Installer l'application</button>
                : <span className="puce ok">Application installée</span>}</p>
            )}
          </div>
          <div className="carte"><FormContact /></div>
        </section>
      </div>

      <PiedSite />
    </div>
  );
}

declare global { interface Window { google?: any } }

/** Charge le script d'identité de Google une seule fois. */
function chargerGoogle(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => ok(); s.onerror = () => ko(new Error('Google est inaccessible pour le moment.'));
    document.head.appendChild(s);
  });
}

/**
 * Bouton « Continuer avec Google ». N'apparaît que si le serveur a un identifiant client configuré.
 * Google ne fournit pas le téléphone : s'il s'agit d'un nouveau compte, on le demande avant de le créer.
 */
/** Réponse du serveur quand un code doit être saisi avant d'ouvrir la session ou de créer le compte. */
interface Verif { verificationId: string; telephone: string; dureeMinutes: number; codeSimule?: string }

/**
 * Saisie du code à 6 chiffres envoyé par SMS. En démonstration, aucun SMS ne part : le serveur renvoie le code
 * et l'encart « SMS simulé » l'affiche à la place du téléphone.
 */
function EtapeCode({ verif, creation, onOk, onAnnuler }: { verif: Verif; creation: boolean; onOk: (j: string, c: Compte) => void; onAnnuler: () => void }) {
  const [v, setV] = useState(verif);
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [info, setInfo] = useState(''); const [occupe, setOccupe] = useState(false);
  async function valider(e: FormEvent) {
    e.preventDefault(); setErr(''); setInfo(''); setOccupe(true);
    try { const r = await api('/auth/verification', { body: { verificationId: v.verificationId, code } }); onOk(r.jeton, r.compte); }
    catch (x: any) { setErr(x.message); } finally { setOccupe(false); }
  }
  async function renvoyer() {
    setErr(''); setInfo(''); setOccupe(true);
    try { setV(await api<Verif>('/auth/verification/renvoyer', { body: { verificationId: v.verificationId } })); setCode(''); setInfo('Un nouveau code vient de vous être envoyé.'); }
    catch (x: any) { setErr(x.message); } finally { setOccupe(false); }
  }
  return (
    <form onSubmit={valider}>
      <h1>Vérifiez votre numéro</h1>
      <p className="auth-intro">Un code à 6 chiffres a été envoyé par SMS au <b>{v.telephone}</b>. Il reste valable {v.dureeMinutes} minutes.</p>
      {v.codeSimule && (
        <div className="sms-simule" role="status">
          <span className="puce warn">SMS simulé</span>
          <p>RetrouvID : votre code de vérification est <b>{v.codeSimule}</b>.</p>
          <small>Démonstration : aucun SMS réel n'est envoyé.</small>
        </div>
      )}
      <Champ id="code" label="Code reçu" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus
        value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
      {info && <Alerte type="ok">{info}</Alerte>}
      {err && <Alerte>{err}</Alerte>}
      <button className="btn p" disabled={occupe || code.length !== 6} style={{ width: '100%' }}>{occupe ? 'Vérification…' : creation ? 'Vérifier et créer mon compte' : 'Vérifier et me connecter'}</button>
      <button type="button" className="btn s" disabled={occupe} style={{ width: '100%', marginTop: 8 }} onClick={renvoyer}>Renvoyer un code</button>
      <button type="button" className="btn s" disabled={occupe} style={{ width: '100%', marginTop: 8 }} onClick={onAnnuler}>Annuler</button>
    </form>
  );
}

function BoutonGoogle({ onOk, onEtape, onVerif }: { onOk: (j: string, c: Compte) => void; onEtape: (telephone: boolean) => void; onVerif: (v: Verif) => void }) {
  const zone = useRef<HTMLDivElement>(null);
  const [actif, setActif] = useState(false);
  const [attente, setAttente] = useState<{ credential: string; prenom: string } | null>(null);
  const [tel, setTel] = useState(''); const [err, setErr] = useState(''); const [occupe, setOccupe] = useState(false);

  async function envoyer(credential: string, telephone?: string) {
    setErr(''); setOccupe(true);
    try {
      const r = await api('/auth/google', { body: telephone ? { credential, telephone } : { credential } });
      if (r.telephoneRequis) { setAttente({ credential, prenom: r.prenom }); onEtape(true); }
      else if (r.verificationRequise) onVerif(r);
      else onOk(r.jeton, r.compte);
    } catch (x: any) { setErr(x.message); } finally { setOccupe(false); }
  }

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const { clientId } = await api<{ clientId: string | null }>('/auth/google/config');
        if (!clientId) return;
        await chargerGoogle();
        if (!vivant || !zone.current) return;
        window.google.accounts.id.initialize({ client_id: clientId, callback: (r: any) => envoyer(r.credential), ux_mode: 'popup' });
        window.google.accounts.id.renderButton(zone.current, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'fr', width: Math.min(360, zone.current.clientWidth || 320) });
        setActif(true);
      } catch { /* Google indisponible : le formulaire classique reste utilisable */ }
    })();
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (attente) return (
    <div className="google-tel">
      <p><b>Bienvenue{attente.prenom ? `, ${attente.prenom}` : ''}.</b> Une dernière information avant de créer votre compte. En le créant, vous acceptez les <Link to="/cgu">conditions d'utilisation</Link>.</p>
      <Champ id="tel-google" label="Téléphone" type="tel" icone="tel" required autoComplete="tel" value={tel} onChange={(e) => setTel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') envoyer(attente.credential, tel); }} aide="Il n'est transmis qu'après validation et paiement." />
      {err && <Alerte>{err}</Alerte>}
      <button type="button" className="btn p" disabled={occupe || !tel} style={{ width: '100%' }} onClick={() => envoyer(attente.credential, tel)}>{occupe ? 'Création…' : 'Créer mon compte'}</button>
      <button type="button" className="btn s" style={{ width: '100%', marginTop: 8 }} onClick={() => { setAttente(null); setErr(''); onEtape(false); }}>Annuler</button>
    </div>
  );
  return (
    <div className="google" hidden={!actif}>
      <div className="ou"><span>ou</span></div>
      <div ref={zone} className="google-zone" />
      {err && <Alerte>{err}</Alerte>}
    </div>
  );
}

function Cadre({ children, enInscription = false }: { children: ReactNode; enInscription?: boolean }) {
  return (
    <div className="auth auth-cadre">
      <div className="auth-in">
        <header className="auth-haut">
          <Link to="/" className="logo auth-logo">Retrouv<span>ID</span></Link>
          <nav className="auth-nav" aria-label="Navigation">
            <Link to="/">Accueil</Link>
            {enInscription ? <Link className="pastille" to="/connexion">Connexion</Link> : <Link className="pastille" to="/inscription">Créer un compte</Link>}
          </nav>
        </header>
        <div className="cadre-grille">
          {/* panneau vert : même scène que la page d'accueil, avec les garanties rappelées à côté du formulaire */}
          <section className="cadre-scene" aria-label="Nos garanties">
            <p className="scene-pastille"><span className="point-vivant" />{enInscription ? 'Inscription gratuite' : 'Espace personnel'}</p>
            <Titre texte={enInscription ? 'Un compte,' : 'Content de vous'} etiquette={enInscription ? 'deux usages.' : 'revoir.'} />
            <ul className="cadre-points">
              <li><Icone nom="shield" taille={18} />Numéro et nom masqués pour le public</li>
              <li><Icone nom="users" taille={18} />Chaque rapprochement vérifié par un agent</li>
              <li><Icone nom="coin" taille={18} />Mise en relation réglée par Wave ou Orange Money</li>
            </ul>
            <Ambiance />
          </section>
          <main id="contenu" className="auth-form">{children}</main>
        </div>
        <footer className="auth-pied-zone"><p className="auth-pied">Vos données personnelles restent masquées tant qu'un agent n'a pas validé la correspondance. <Link to="/confidentialite">Confidentialité</Link></p></footer>
      </div>
    </div>
  );
}

export function Connexion({ onOk }: { onOk: (j: string, c: Compte) => void }) {
  const [email, setEmail] = useState(''); const [mdp, setMdp] = useState('');
  const [err, setErr] = useState(''); const [occupe, setOccupe] = useState(false); const [tel, setTel] = useState(false);
  const [verif, setVerif] = useState<Verif | null>(null);
  async function envoyer(e: FormEvent) {
    e.preventDefault(); setErr(''); setOccupe(true);
    try {
      const r = await api('/auth/connexion', { body: { email, motDePasse: mdp } });
      if (r.verificationRequise) setVerif(r); else onOk(r.jeton, r.compte);
    } catch (x: any) { setErr(x.message); } finally { setOccupe(false); }
  }
  if (verif) return (
    <Cadre><div className="auth-carte"><EtapeCode verif={verif} creation={false} onOk={onOk} onAnnuler={() => { setVerif(null); setTel(false); }} /></div></Cadre>
  );
  return (
    <Cadre><div className="auth-carte"><form onSubmit={envoyer} hidden={tel}>
      <h1>Bon retour</h1>
      <p className="auth-intro">Connectez-vous pour suivre vos dossiers.</p>
      <Champ id="email" label="Adresse e-mail" type="email" icone="mail" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <MotDePasse id="mdp" label="Mot de passe" autoComplete="current-password" required value={mdp} onChange={(e) => setMdp(e.target.value)} />
      {err && <Alerte>{err}</Alerte>}
      <button className="btn p" disabled={occupe} style={{ width: '100%' }}>{occupe ? 'Connexion…' : 'Se connecter'}</button>
      <p className="muted" style={{ marginTop: 14 }}>Pas de compte ? <Link to="/inscription">Créer un compte</Link></p>
    </form><BoutonGoogle onOk={onOk} onEtape={setTel} onVerif={setVerif} /></div></Cadre>
  );
}

export function Inscription({ onOk }: { onOk: (j: string, c: Compte) => void }) {
  const [f, setF] = useState({ nom: '', prenom: '', email: '', telephone: '', motDePasse: '', accepteCgu: false, siteWeb: '' });
  const [err, setErr] = useState(''); const [occupe, setOccupe] = useState(false); const [tel, setTel] = useState(false);
  const maj = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const [verif, setVerif] = useState<Verif | null>(null);
  async function envoyer(e: FormEvent) {
    e.preventDefault(); setErr(''); setOccupe(true);
    try {
      const r = await api('/auth/inscription', { body: f });
      if (r.verificationRequise) setVerif(r); else onOk(r.jeton, r.compte);
    } catch (x: any) { setErr(x.message); } finally { setOccupe(false); }
  }
  if (verif) return (
    <Cadre enInscription><div className="auth-carte"><EtapeCode verif={verif} creation onOk={onOk} onAnnuler={() => { setVerif(null); setTel(false); }} /></div></Cadre>
  );
  return (
    <Cadre enInscription><div className="auth-carte"><form onSubmit={envoyer} hidden={tel}>
      <h1>Créer un compte</h1>
      <p className="auth-intro">Le même compte sert à déclarer une perte et à signaler un document trouvé.</p>
      <Champ id="prenom" label="Prénom" icone="user" required autoComplete="given-name" value={f.prenom} onChange={maj('prenom')} />
      <Champ id="nom" label="Nom" icone="user" required autoComplete="family-name" value={f.nom} onChange={maj('nom')} />
      <Champ id="email" label="Adresse e-mail" type="email" icone="mail" required autoComplete="email" value={f.email} onChange={maj('email')} />
      <Champ id="tel" label="Téléphone" type="tel" icone="tel" required autoComplete="tel" value={f.telephone} onChange={maj('telephone')} aide="Il n'est transmis qu'après validation et paiement." />
      <MotDePasse id="mdp" label="Mot de passe" required minLength={8} autoComplete="new-password" value={f.motDePasse} onChange={maj('motDePasse')} aide="8 caractères minimum." />
      <div className="piege" aria-hidden="true"><label htmlFor="site-web">Ne pas remplir</label><input id="site-web" name="site_web" tabIndex={-1} autoComplete="off" value={f.siteWeb} onChange={maj('siteWeb')} /></div>
      <label className="case" htmlFor="cgu"><input id="cgu" type="checkbox" required checked={f.accepteCgu} onChange={(e) => setF({ ...f, accepteCgu: e.target.checked })} />
        <span>J'ai lu les <Link to="/cgu">conditions d'utilisation</Link> et la <Link to="/confidentialite">politique de confidentialité</Link>.</span></label>
      {err && <Alerte>{err}</Alerte>}
      <button className="btn p" disabled={occupe} style={{ width: '100%' }}>{occupe ? 'Création…' : 'Créer mon compte'}</button>
      <p className="muted" style={{ marginTop: 14 }}>Déjà un compte ? <Link to="/connexion">Se connecter</Link></p>
    </form><BoutonGoogle onOk={onOk} onEtape={setTel} onVerif={setVerif} /></div></Cadre>
  );
}
