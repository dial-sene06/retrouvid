import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, Compte, DOCS, ETATS_CORR, ETATS_DOSSIER, fdate, OPTIONS_DOCS } from '../api';
import { Action, Alerte, Champ, Doc, Icone, Liste, Puce, Stat, Titre, Vide } from '../ui';
import { Discussion } from '../discussion';
import { Rubans } from '../rubans';
import { CarteOsm, ChampLieu, distanceTexte, Pt } from '../geo';
import { SuiviTrouvaille } from './Decouvreur';

const ETAPES = ['Déclaré', 'Vérifié par un agent', 'Confirmé par vous', 'Coordonnées', 'Remis'];
const rang: Record<string, number> = { en_verification: 1, validee_agent: 2, validee_citoyen: 3, payee: 4, remise: 5, cloturee: 5 };

function Suivi({ c, recharger }: { c: any; recharger: () => void }) {
  const [coord, setCoord] = useState<any>(null);
  const [err, setErr] = useState('');
  const n = rang[c.etat] ?? 1;

  async function voirCoord() { setErr(''); try { setCoord(await api(`/correspondances/${c.id}/coordonnees`)); } catch (e: any) { setErr(e.message); } }
  useEffect(() => { if (c.coordonnees_disponibles) voirCoord(); /* eslint-disable-next-line */ }, [c.coordonnees_disponibles]);

  return (
    <div className="carte">
      <div className="ligne espace"><Doc type={c.type_document} /><Puce ton={c.etat === 'remise' ? 'ok' : undefined}>{ETATS_CORR[c.etat]}</Puce></div>
      <p className="muted" style={{ margin: '6px 0 0' }}>Numéro {c.numero}</p>
      <div className="etapes" aria-label="Avancement">{ETAPES.map((e, i) => <span key={e} className={i < n ? 'fait' : ''}>{e}</span>)}</div>

      {c.etat === 'validee_citoyen' && c.paiement_statut === 'echoue' && <Alerte>Le dernier paiement n'a pas abouti. Vous pouvez réessayer.</Alerte>}
      {c.etat === 'en_verification' && <Alerte type="info">Un document pourrait correspondre au vôtre. Un agent compare les informations. Vous serez prévenu.</Alerte>}
      {c.signalement && (
        <p>Document signalé : trouvé à <b>{c.signalement.lieu_trouve}</b> le {fdate(c.signalement.date_trouve)}.{c.signalement.description ? ` ${c.signalement.description}` : ''}
          {c.distance_km != null && <> Le lieu est à {distanceTexte(c.distance_km)} de celui de la perte (à vol d'oiseau).</>}</p>
      )}
      {c.signalement?.lat != null && <CarteOsm pos={{ lat: c.signalement.lat, lng: c.signalement.lng }} titre="Lieu où le document a été trouvé" />}
      {c.peut_valider && <>
        <p>Un agent a vérifié cette correspondance. Si ce document est bien le vôtre, confirmez.</p>
        <Action onClick={async () => { await api(`/correspondances/${c.id}/valider`, { method: 'POST' }); recharger(); }}>Oui, c'est mon document</Action>
      </>}
      {c.peut_payer && (c.paiement_disponible ? <>
        <Alerte type="warn">Pour obtenir les coordonnées de la personne qui l'a trouvé, un paiement de {c.montant} FCFA est demandé, par Wave ou Orange Money. Vous passez sur la page sécurisée de PayDunya : RetrouvID ne voit ni votre numéro de paiement ni votre code secret.</Alerte>
        {c.paiement_statut === 'en_attente' && <Alerte type="info">Un paiement est déjà ouvert pour ce dossier. S'il est terminé, <Link to={`/paiement/retour/${c.id}`}>vérifiez-le ici</Link>.</Alerte>}
        <Action onClick={async () => {
          const r = await api<{ url: string }>(`/correspondances/${c.id}/payer`, { method: 'POST' });
          window.location.assign(r.url);
          await new Promise((fin) => setTimeout(fin, 8000)); // le bouton reste occupé le temps de la redirection
        }}>Payer {c.montant} FCFA avec Wave ou Orange Money</Action>
      </> : <Alerte type="info">Le paiement en ligne n'est pas encore ouvert sur cette installation. Revenez plus tard : votre dossier reste validé.</Alerte>)}
      {coord && (
        <div className="alerte ok">
          <b>Coordonnées de la personne qui l'a trouvé</b><br />{coord.prenom} {coord.nom}<br />Téléphone : {coord.telephone}<br />E-mail : {coord.email}
        </div>
      )}
      {err && <Alerte>{err}</Alerte>}
      {c.peut_confirmer_remise && <>
        <p>Après avoir récupéré votre document, confirmez la remise. L'autre personne doit la confirmer aussi.</p>
        <Action onClick={async () => { await api(`/correspondances/${c.id}/confirmer-remise`, { method: 'POST' }); recharger(); }}>Je confirme avoir récupéré mon document</Action>
      </>}
      {c.messagerie_ouverte && <Discussion id={c.id} />}
      {c.etat === 'payee' && c.remise_confirmee_par_moi && <Alerte type="info">Vous avez confirmé. En attente de l'autre personne.</Alerte>}
      {c.etat === 'remise' && <Alerte type="ok">Remise confirmée par les deux parties. Un administrateur clôturera ensuite le dossier et effacera les données personnelles.</Alerte>}
    </div>
  );
}

export function Citoyen({ compte, onChange }: { compte: Compte; onChange: () => void }) {
  const [decl, setDecl] = useState<any[] | null>(null);
  const [sig, setSig] = useState<any[] | null>(null);
  const [corr, setCorr] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [err, setErr] = useState('');
  const [rech, setRech] = useState('');
  const charger = useCallback(() => {
    Promise.all([api<any[]>('/declarations'), api<any[]>('/signalements'), api<any[]>('/correspondances'), api('/citoyen/stats')])
      .then(([d, s, c, st]) => { setDecl(d); setSig(s); setCorr(c); setStats(st); setErr(''); onChange(); }).catch((e) => setErr(e.message));
  }, [onChange]);
  useEffect(charger, [charger]);
  const terme = rech.trim().toLowerCase();
  const garde = (x: any) => !terme || [DOCS[x.type_document]?.nom, x.type_document, x.lieu_perte, x.lieu_trouve, x.numero, ETATS_DOSSIER[x.etat], ETATS_CORR[x.etat]].some((v) => String(v ?? '').toLowerCase().includes(terme));
  const pertes = corr.filter((c) => c.cote === 'perte' && garde(c));
  const trouvailles = corr.filter((c) => c.cote === 'trouvaille' && garde(c));
  const declV = decl?.filter(garde) ?? null; const sigV = sig?.filter(garde) ?? null;

  return (
    <>
      <section className="bandeau">
        <Rubans forme="vague" />
        <div>
          <Titre niveau={1} texte="Bonjour" etiquette={compte.prenom} />
          <p>Suivez vos déclarations ou signalez un document que vous avez trouvé. Vos données restent masquées jusqu'à la validation d'un agent.</p>
          <div className="ligne">
            <Link className="btn p clair" to="/declarer"><Icone nom="plus" />J'ai perdu un document</Link>
            <Link className="btn s clair" to="/signaler"><Icone nom="flag" />J'ai trouvé un document</Link>
          </div>
        </div>
      </section>
      {err && <Alerte>{err}</Alerte>}
      {stats && (
        <div className="grille-kpi stats-citoyen">
          <Stat icone="doc" titre="Pertes déclarées" valeur={stats.declarations} />
          <Stat icone="flag" titre="Documents trouvés" valeur={stats.signalements} />
          <Stat icone="link" titre="Dossiers en cours" valeur={stats.en_cours} />
          <Stat icone="check" titre="Restitués" valeur={stats.restitues} />
        </div>
      )}

      <div className="recherche-dossiers">
        <Icone nom="search" />
        <label htmlFor="rech" className="sr">Rechercher dans mes dossiers</label>
        <input id="rech" type="search" value={rech} onChange={(e) => setRech(e.target.value)} placeholder="Rechercher par type, lieu, numéro ou état" />
      </div>
      <h2 className="titre-section">Ce que j'ai perdu</h2>
      {pertes.map((c) => <Suivi key={c.id} c={c} recharger={charger} />)}
      {declV === null ? <p className="muted">Chargement…</p> : declV.length === 0 ? <Vide>{terme ? 'Aucune déclaration ne correspond à cette recherche.' : "Vous n'avez rien déclaré pour l'instant."}</Vide> :
        declV.map((d) => (
          <div className="carte" key={d.id}>
            <div className="ligne espace"><Doc type={d.type_document} /><Puce>{ETATS_DOSSIER[d.etat]}</Puce></div>
            <p className="muted" style={{ margin: '6px 0 0' }}>Perdu à {d.lieu_perte}, le {fdate(d.date_perte)}</p>
            {d.etat === 'en_attente' && (
              <div className="ligne" style={{ marginTop: 10 }}>
                <Link className="btn s" to={`/declarations/${d.id}/modifier`}><Icone nom="edit" />Corriger</Link>
                <Action ton="s" confirmer="Supprimer cette déclaration ? Cette action est définitive." onClick={async () => { await api(`/declarations/${d.id}`, { method: 'DELETE' }); charger(); }}><Icone nom="trash" />Supprimer</Action>
              </div>
            )}
          </div>
        ))}

      <h2 className="titre-section">Ce que j'ai trouvé</h2>
      {trouvailles.map((c) => <SuiviTrouvaille key={c.id} c={c} recharger={charger} />)}
      {sigV === null ? <p className="muted">Chargement…</p> : sigV.length === 0 ? <Vide>{terme ? 'Aucun signalement ne correspond à cette recherche.' : "Vous n'avez rien signalé pour l'instant."}</Vide> :
        sigV.map((s) => (
          <div className="carte" key={s.id}>
            <div className="ligne espace"><Doc type={s.type_document} /><Puce>{ETATS_DOSSIER[s.etat]}</Puce></div>
            <p className="muted" style={{ margin: '6px 0 0' }}>Trouvé à {s.lieu_trouve}, le {fdate(s.date_trouve)}{s.a_photo ? ' · photo jointe' : ''}{s.lat != null ? ' · position enregistrée' : ''}</p>
            {s.etat === 'en_attente' && (
              <div className="ligne" style={{ marginTop: 10 }}>
                <Action ton="s" confirmer="Supprimer ce signalement ? Cette action est définitive." onClick={async () => { await api(`/signalements/${s.id}`, { method: 'DELETE' }); charger(); }}><Icone nom="trash" />Supprimer</Action>
              </div>
            )}
          </div>
        ))}
    </>
  );
}

export function NouvelleDeclaration() {
  const nav = useNavigate();
  const { id } = useParams();
  const [f, setF] = useState({ typeDocument: 'cni', numero: '', nomProprietaire: '', dateNaissance: '', lieuPerte: '', datePerte: '', description: '' });
  const [pos, setPos] = useState<Pt | null>(null);
  const [err, setErr] = useState(''); const [occupe, setOccupe] = useState(false);
  useEffect(() => {
    if (!id) return;
    api<any[]>('/declarations').then((l) => {
      const d = l.find((x) => x.id === id);
      if (!d) return setErr('Déclaration introuvable.');
      setF({ typeDocument: d.type_document, numero: d.numero, nomProprietaire: d.nom_proprietaire, dateNaissance: d.date_naissance?.slice(0, 10) ?? '',
        lieuPerte: d.lieu_perte, datePerte: d.date_perte.slice(0, 10), description: d.description ?? '' });
      if (d.lat != null) setPos({ lat: d.lat, lng: d.lng });
    }).catch((e) => setErr(e.message));
  }, [id]);
  const maj = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function envoyer(e: FormEvent) {
    e.preventDefault(); setErr(''); setOccupe(true);
    const body: any = { ...f }; if (!body.dateNaissance) delete body.dateNaissance; if (!body.description) delete body.description;
    if (pos) { body.lat = pos.lat; body.lng = pos.lng; }
    try { await api(id ? `/declarations/${id}` : '/declarations', { method: id ? 'PATCH' : 'POST', body }); nav('/'); } catch (x: any) { setErr(x.message); } finally { setOccupe(false); }
  }
  return (
    <form className="cote carte" onSubmit={envoyer}>
      <h1 className="titre-page">{id ? 'Corriger la déclaration' : 'Déclarer une perte'}</h1>
      <Liste id="type" label="Type de document" value={f.typeDocument} onChange={maj('typeDocument')} options={OPTIONS_DOCS} />
      <Champ id="numero" label="Numéro du document" required value={f.numero} onChange={maj('numero')} aide="S'il vous reste une copie ou une photo. Il reste masqué pour les autres." />
      <Champ id="nom" label="Nom complet sur le document" required value={f.nomProprietaire} onChange={maj('nomProprietaire')} />
      <Champ id="naiss" label="Date de naissance (facultatif)" type="date" value={f.dateNaissance} onChange={maj('dateNaissance')} />
      <ChampLieu id="lieu" label="Où l'avez-vous perdu ?" valeur={f.lieuPerte} onValeur={(v) => setF((x) => ({ ...x, lieuPerte: v }))} pos={pos} onPos={setPos} />
      <Champ id="date" label="Date de la perte" type="date" required max={new Date().toISOString().slice(0, 10)} value={f.datePerte} onChange={maj('datePerte')} />
      <Champ id="desc" label="Précisions (facultatif)" maxLength={500} value={f.description} onChange={maj('description')} />
      {err && <Alerte>{err}</Alerte>}
      <button className="btn p" disabled={occupe} style={{ width: '100%' }}>{occupe ? 'Enregistrement…' : id ? 'Enregistrer les corrections' : 'Enregistrer la déclaration'}</button>
    </form>
  );
}
