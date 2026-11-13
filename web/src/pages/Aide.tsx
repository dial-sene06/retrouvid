import { FormEvent, useState } from 'react';
import { api, Compte } from '../api';
import { Alerte, Champ, Icone, useInstall } from '../ui';

const QUESTIONS: [string, string][] = [
  ['Combien ça coûte ?',
    "Déclarer une perte et signaler un document trouvé sont gratuits. Pour recevoir les coordonnées de la personne qui l'a trouvé, le propriétaire règle 1 000 FCFA par Wave ou Orange Money, sur la page sécurisée de PayDunya. Le paiement n'est demandé qu'après la vérification d'un agent et votre confirmation. Si le paiement échoue, rien n'est débité : vous pouvez réessayer depuis votre dossier."],
  ['Qui voit mes informations ?',
    "Le numéro et le nom du document restent masqués pour les autres utilisateurs. Un agent les voit partiellement masqués pour comparer. Votre téléphone et votre e-mail ne sont transmis à l'autre personne qu'après validation par un agent, confirmation du propriétaire et paiement."],
  ['Comment fonctionne le rapprochement ?',
    "Le système compare le numéro, le nom et la date de naissance. Un numéro identique pèse le plus, puis le nom. Au-dessus d'un seuil, la correspondance part dans la file d'un agent. Rien n'est transmis tant qu'il n'a pas validé."],
  ['À quoi sert ma position GPS ?',
    "Elle est facultative. Elle aide l'agent à juger si le lieu de perte et le lieu de découverte sont proches (distance à vol d'oiseau, à titre indicatif). Le lieu exact de la découverte n'est montré au propriétaire qu'après validation par un agent. Les coordonnées sont effacées à la clôture du dossier."],
  ['Puis-je corriger ou supprimer un dossier ?',
    "Oui, tant qu'aucun rapprochement n'est en cours. Une déclaration peut être corrigée ou supprimée, un signalement peut être supprimé. Une fois la vérification commencée, seule l'administration peut intervenir."],
  ['Quand puis-je écrire à l\'autre personne ?',
    "Une fois le paiement effectué. Une discussion s'ouvre alors dans le dossier, pour convenir du lieu et de l'heure de la remise. Les messages sont supprimés à la clôture."],
  ['Que devient mon dossier après la remise ?',
    "Quand les deux parties ont confirmé la remise, un administrateur clôture le dossier. Le numéro, le nom, la photo, les messages et les positions sont alors effacés ou anonymisés."],
  ["Comment installer l'application ?",
    "RetrouvID est une application web installable. Depuis Chrome ou Edge, utilisez le bouton « Installer l'application » ou le menu du navigateur. Sur iPhone, ouvrez le menu Partager de Safari puis « Sur l'écran d'accueil »."],
];

export function Faq() {
  return (
    <div className="faq">
      {QUESTIONS.map(([q, r]) => (
        <details key={q}><summary>{q}</summary><p>{r}</p></details>
      ))}
    </div>
  );
}

export function FormContact({ compte }: { compte?: Compte | null }) {
  const [f, setF] = useState({ nom: compte ? `${compte.prenom} ${compte.nom}` : '', email: compte?.email ?? '', sujet: '', message: '', siteWeb: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState(false); const [occupe, setOccupe] = useState(false);
  const maj = (k: string) => (e: any) => { setF({ ...f, [k]: e.target.value }); setOk(false); };
  async function envoyer(e: FormEvent) {
    e.preventDefault(); setErr(''); setOk(false); setOccupe(true);
    try { await api('/public/contact', { body: f }); setOk(true); setF({ ...f, sujet: '', message: '' }); }
    catch (x: any) { setErr(x.message); } finally { setOccupe(false); }
  }
  return (
    <form className="form-contact" onSubmit={envoyer}>
      <Champ id="c-nom" label="Nom" required minLength={2} maxLength={80} value={f.nom} onChange={maj('nom')} />
      <Champ id="c-mail" label="Adresse e-mail" type="email" required value={f.email} onChange={maj('email')} />
      <Champ id="c-sujet" label="Sujet" required minLength={3} maxLength={120} value={f.sujet} onChange={maj('sujet')} />
      <div className="champ">
        <label htmlFor="c-msg">Message</label>
        <textarea id="c-msg" required minLength={10} maxLength={1000} rows={4} value={f.message} onChange={maj('message')} />
        <small>{f.message.length}/1000 · 10 caractères au minimum</small>
      </div>
      <div className="piege" aria-hidden="true"><label htmlFor="c-site">Ne pas remplir</label><input id="c-site" name="site_web" tabIndex={-1} autoComplete="off" value={f.siteWeb} onChange={maj('siteWeb')} /></div>
      {err && <Alerte>{err}</Alerte>}
      {ok && <Alerte type="ok">Message envoyé. L'équipe vous répondra à l'adresse indiquée.</Alerte>}
      <button className="btn p" disabled={occupe}><Icone nom="send" />{occupe ? 'Envoi…' : 'Envoyer le message'}</button>
    </form>
  );
}

export function Aide({ compte }: { compte: Compte }) {
  const inst = useInstall();
  return (
    <>
      <div className="entete-page"><div><h1>Aide</h1><p className="muted">Les réponses aux questions fréquentes, puis un formulaire si vous ne trouvez pas la vôtre.</p></div></div>
      <div className="carte"><Faq /></div>
      {(inst.peut || inst.installee) && (
        <div className="carte ligne espace">
          <p style={{ margin: 0 }}>{inst.installee ? "L'application est installée sur cet appareil." : "Installez RetrouvID sur l'écran d'accueil pour l'ouvrir comme une application."}</p>
          {inst.peut && <button className="btn s" onClick={inst.installer}><Icone nom="download" />Installer l'application</button>}
        </div>
      )}
      <div className="carte">
        <h2>Nous écrire</h2>
        <FormContact compte={compte} />
      </div>
    </>
  );
}
