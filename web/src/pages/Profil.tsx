import { FormEvent, useEffect, useState } from 'react';
import { api, Compte } from '../api';
import { Link } from 'react-router-dom';
import { Alerte, Champ, Icone, MotDePasse, Stat } from '../ui';

export function ChangerMotDePasse() {
  const [f, setF] = useState({ ancien: '', nouveau: '', confirmation: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState(false); const [occupe, setOccupe] = useState(false);
  const maj = (k: string) => (e: any) => { setF({ ...f, [k]: e.target.value }); setOk(false); };
  async function envoyer(e: FormEvent) {
    e.preventDefault(); setErr(''); setOk(false);
    if (f.nouveau !== f.confirmation) return setErr('La confirmation ne correspond pas au nouveau mot de passe.');
    setOccupe(true);
    try { await api('/auth/mot-de-passe', { method: 'PATCH', body: { ancien: f.ancien, nouveau: f.nouveau } }); setOk(true); setF({ ancien: '', nouveau: '', confirmation: '' }); }
    catch (x: any) { setErr(x.message); } finally { setOccupe(false); }
  }
  return (
    <form className="cote carte" onSubmit={envoyer}>
      <h2>Mot de passe</h2>
      <MotDePasse id="mdp-ancien" label="Mot de passe actuel" required autoComplete="current-password" value={f.ancien} onChange={maj('ancien')} />
      <MotDePasse id="mdp-nouveau" label="Nouveau mot de passe" required minLength={8} autoComplete="new-password" value={f.nouveau} onChange={maj('nouveau')} aide="8 caractères minimum." />
      <MotDePasse id="mdp-conf" label="Confirmer le nouveau mot de passe" required minLength={8} autoComplete="new-password" value={f.confirmation} onChange={maj('confirmation')} />
      {err && <Alerte>{err}</Alerte>}
      {ok && <Alerte type="ok">Mot de passe modifié.</Alerte>}
      <button className="btn p" disabled={occupe} style={{ width: '100%' }}>{occupe ? 'Modification…' : 'Changer le mot de passe'}</button>
    </form>
  );
}

export function FormProfil({ compte, onMaj }: { compte: Compte & { telephone?: string }; onMaj: (c: Compte) => void }) {
  const [f, setF] = useState({ nom: compte.nom, prenom: compte.prenom, telephone: compte.telephone ?? '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState(false); const [occupe, setOccupe] = useState(false);
  const maj = (k: string) => (e: any) => { setF({ ...f, [k]: e.target.value }); setOk(false); };
  async function envoyer(e: FormEvent) {
    e.preventDefault(); setErr(''); setOk(false); setOccupe(true);
    try { onMaj(await api('/auth/moi', { method: 'PATCH', body: f })); setOk(true); } catch (x: any) { setErr(x.message); } finally { setOccupe(false); }
  }
  return (
    <form className="cote carte" onSubmit={envoyer}>
      <h2>Informations personnelles</h2>
      <Champ id="prenom" label="Prénom" required value={f.prenom} onChange={maj('prenom')} />
      <Champ id="nom" label="Nom" required value={f.nom} onChange={maj('nom')} />
      <Champ id="tel" label="Téléphone" type="tel" required value={f.telephone} onChange={maj('telephone')} aide="Il n'est communiqué qu'à la personne dont le document correspond, après paiement." />
      <Champ id="mail" label="Adresse e-mail" value={compte.email} disabled aide="L'adresse e-mail ne peut pas être modifiée." />
      {err && <Alerte>{err}</Alerte>}
      {ok && <Alerte type="ok">Profil mis à jour.</Alerte>}
      <button className="btn p" disabled={occupe} style={{ width: '100%' }}>{occupe ? 'Enregistrement…' : 'Enregistrer'}</button>
    </form>
  );
}

export function Profil({ compte, onMaj }: { compte: Compte & { telephone?: string }; onMaj: (c: Compte) => void }) {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => {
    if (compte.role === 'citoyen') api('/citoyen/stats').then(setStats).catch(() => {});
    else if (compte.role === 'agent') api('/agent/stats').then(setStats).catch(() => {});
  }, [compte.role]);
  return (
    <>
      <h1 className="titre-page">Mon profil</h1>
      {stats && compte.role === 'citoyen' && (
        <div className="grille-kpi">
          <Stat icone="doc" titre="Pertes déclarées" valeur={stats.declarations} />
          <Stat icone="flag" titre="Documents trouvés" valeur={stats.signalements} />
          <Stat icone="link" titre="Dossiers en cours" valeur={stats.en_cours} />
          <Stat icone="check" titre="Restitués" valeur={stats.restitues} />
        </div>
      )}
      {stats && compte.role === 'agent' && (
        <div className="grille-kpi">
          <Stat icone="shield" titre="À vérifier" valeur={stats.a_verifier} />
          <Stat icone="check" titre="Validées par moi" valeur={stats.validees} />
          <Stat icone="list" titre="Écartées par moi" valeur={stats.ecartees} />
        </div>
      )}
      <FormProfil compte={compte} onMaj={onMaj} />
      <p><Link className="btn s" to="/reglages"><Icone nom="cible" />Mot de passe, apparence, installation</Link></p>
    </>
  );
}
