import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ETATS_CORR, fdate , OPTIONS_DOCS } from '../api';
import { Action, Alerte, Champ, Doc, Liste, Photo, Puce } from '../ui';
import { Discussion } from '../discussion';
import { ChampLieu, Pt } from '../geo';

export function SuiviTrouvaille({ c, recharger }: { c: any; recharger: () => void }) {
  return (
    <div className="carte">
      <div className="ligne espace"><Doc type={c.type_document} /><Puce ton={c.etat === 'remise' ? 'ok' : undefined}>{ETATS_CORR[c.etat]}</Puce></div>
      <p className="muted" style={{ margin: '6px 0 10px' }}>Trouvé à {c.lieu_trouve}, le {fdate(c.date_trouve)}</p>
      {c.etat === 'en_verification' && <Alerte type="info">Un agent vérifie la correspondance avec un propriétaire possible.</Alerte>}
      {(c.etat === 'validee_agent' || c.etat === 'validee_citoyen') && <Alerte type="info">Le propriétaire doit encore confirmer. Rien à faire de votre côté.</Alerte>}
      {c.etat === 'payee' && <Alerte type="ok">Le propriétaire a reçu vos coordonnées et va vous contacter. Une fois le document remis, confirmez ci-dessous.</Alerte>}
      {c.peut_confirmer_remise && (
        <Action onClick={async () => { await api(`/correspondances/${c.id}/confirmer-remise`, { method: 'POST' }); recharger(); }}>J'ai remis le document</Action>
      )}
      {c.messagerie_ouverte && <Discussion id={c.id} />}
      {c.etat === 'payee' && c.remise_confirmee_par_moi && <Alerte type="info">Vous avez confirmé. En attente du propriétaire.</Alerte>}
      {c.etat === 'remise' && <Alerte type="ok">Remise confirmée par les deux parties. Merci !</Alerte>}
    </div>
  );
}

/**
 * Signaler un document trouvé, ou corriger un signalement (route /signalements/:id/modifier).
 * En correction, la photo déjà envoyée est conservée si on n'en choisit pas une nouvelle.
 */
export function NouveauSignalement() {
  const nav = useNavigate();
  const { id } = useParams();
  const [f, setF] = useState({ typeDocument: 'cni', numero: '', nomSurDocument: '', dateNaissance: '', lieuTrouve: '', dateTrouve: '', description: '' });
  const [photo, setPhoto] = useState('');
  const [pos, setPos] = useState<Pt | null>(null);
  const [err, setErr] = useState(''); const [occupe, setOccupe] = useState(false);
  const [charge, setCharge] = useState(!id);
  useEffect(() => {
    if (!id) return;
    api<any>(`/signalements/${id}/correction`).then((s) => {
      setF({ typeDocument: s.type_document, numero: s.numero, nomSurDocument: s.nom_sur_document, dateNaissance: s.date_naissance?.slice(0, 10) ?? '',
        lieuTrouve: s.lieu_trouve, dateTrouve: s.date_trouve.slice(0, 10), description: s.description ?? '' });
      if (s.lat != null) setPos({ lat: s.lat, lng: s.lng });
      setCharge(true);
    }).catch((e) => setErr(e.message));
  }, [id]);
  const maj = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function envoyer(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!id && !photo) { setErr('Ajoutez une photo du document : elle est obligatoire.'); return; }
    setOccupe(true);
    const body: any = { ...f }; if (!body.dateNaissance) delete body.dateNaissance; if (!body.description) delete body.description;
    if (photo) body.photo = photo;
    if (pos) { body.lat = pos.lat; body.lng = pos.lng; }
    try { await api(id ? `/signalements/${id}` : '/signalements', { method: id ? 'PATCH' : 'POST', body }); nav('/'); } catch (x: any) { setErr(x.message); } finally { setOccupe(false); }
  }
  if (id && !charge) return (
    <div className="cote carte">
      <h1 className="titre-page">Corriger le signalement</h1>
      {err ? <Alerte>{err}</Alerte> : <p className="muted">Chargement…</p>}
    </div>
  );
  return (
    <form className="cote carte" onSubmit={envoyer}>
      <h1 className="titre-page">{id ? 'Corriger le signalement' : 'Signaler un document trouvé'}</h1>
      {id
        ? <p className="muted">Un signalement peut être corrigé deux fois au maximum. Après cela, ces informations ne vous seront plus affichées.</p>
        : <>
          <Alerte type="info">Les données du document ne sont jamais affichées aux autres utilisateurs. Elles servent uniquement à trouver le propriétaire.</Alerte>
          <Alerte type="warn">En envoyant ce signalement, vous acceptez que votre nom, votre téléphone et votre e-mail soient transmis au propriétaire du document, une fois qu'un agent a vérifié la correspondance et que le propriétaire l'a confirmée et réglé l'accès.</Alerte>
        </>}
      <Liste id="type" label="Type de document" value={f.typeDocument} onChange={maj('typeDocument')} options={OPTIONS_DOCS} />
      <Champ id="numero" label="Numéro du document" required value={f.numero} onChange={maj('numero')} />
      <Champ id="nom" label="Nom complet inscrit sur le document" required value={f.nomSurDocument} onChange={maj('nomSurDocument')} />
      <Champ id="naiss" label="Date de naissance (facultatif)" type="date" value={f.dateNaissance} onChange={maj('dateNaissance')} />
      <ChampLieu id="lieu" label="Où l'avez-vous trouvé ?" valeur={f.lieuTrouve} onValeur={(v) => setF((x) => ({ ...x, lieuTrouve: v }))} pos={pos} onPos={setPos} />
      <Champ id="date" label="Date de la découverte" type="date" required max={new Date().toISOString().slice(0, 10)} value={f.dateTrouve} onChange={maj('dateTrouve')} />
      <Champ id="desc" label="Précisions (facultatif)" maxLength={500} value={f.description} onChange={maj('description')} />
      {id && <p className="muted" style={{ marginBottom: 8 }}>La photo déjà envoyée est conservée. Choisissez-en une nouvelle seulement pour la remplacer.</p>}
      <Photo valeur={photo} onChange={setPhoto} />
      {err && <Alerte>{err}</Alerte>}
      <button className="btn p" disabled={occupe} style={{ width: '100%' }}>{occupe ? 'Envoi…' : id ? 'Enregistrer les corrections' : 'Envoyer le signalement'}</button>
    </form>
  );
}
