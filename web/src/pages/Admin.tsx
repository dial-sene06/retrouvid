import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, DOCS, ETATS_CORR, fdate } from '../api';
import { Aire, Anneau, Barres, Sparkline, somme, variation } from '../charts';
import { Action, Alerte, Champ, Doc, Icone, PhotoVue, Puce, Vide } from '../ui';

const ACTIONS: Record<string, string> = {
  connexion: 'Connexion', inscription: 'Inscription', recherche: 'Recherche', agent_cree: 'Agent créé', compte_desactive: 'Compte désactivé',
  declaration_creee: 'Déclaration enregistrée', declaration_modifiee: 'Déclaration corrigée', profil_modifie: 'Profil modifié', contenu_retire: 'Contenu retiré', signalement_cree: 'Document signalé', paiement_simule: 'Paiement simulé', paiement_initie: 'Paiement ouvert', paiement_reussi: 'Paiement reçu', paiement_incoherent: 'Paiement incohérent',
  consultation_donnees_masquees: 'Consultation de données masquées', consultation_coordonnees: 'Consultation de coordonnées', consultation_photo: 'Consultation d\'une photo',
  correspondance_validee_agent: 'Validation par un agent', correspondance_validee_citoyen: 'Validation par le citoyen',
  signalement_modifie: 'Signalement corrigé', signalement_supprime: 'Signalement supprimé', declaration_supprimee: 'Déclaration supprimée', message_envoye: 'Message envoyé', mot_de_passe_modifie: 'Mot de passe modifié', contact_traite: 'Message de contact traité',
  correspondance_ecartee: 'Correspondance écartée', remise_confirmee: 'Remise confirmée', cloture_anonymisation: 'Clôture et anonymisation',
};
const libelle = (a: string) => ACTIONS[a] ?? a.replace(/_/g, ' ');
const depuis = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
};
const ENTONNOIR: [string, string][] = [['en_verification', 'À vérifier'], ['validee_agent', 'Validée par un agent'], ['validee_citoyen', 'Confirmée par le citoyen'], ['payee', 'Payée'], ['remise', 'Remise confirmée'], ['cloturee', 'Clôturée']];
const COULEUR_TYPE: Record<string, string> = { cni: 'var(--cni)', permis: 'var(--permis)', passeport: 'var(--passeport)' };

function Kpi({ icone, titre, valeurs, total }: { icone: string; titre: string; valeurs: number[]; total: number }) {
  const v = variation(valeurs);
  return (
    <div className="carte kpi-carte">
      <div className="kpi-tete"><span className="kpi-ic"><Icone nom={icone} taille={20} /></span><span className="kpi-titre">{titre}</span></div>
      <div className="kpi-corps">
        <div><b className="kpi-n">{total}</b>
          <span className={`delta ${v >= 0 ? 'hausse' : 'baisse'}`}><Icone nom={v >= 0 ? 'up' : 'down'} taille={14} />{v >= 0 ? '+' : ''}{v} %</span></div>
        <Sparkline valeurs={valeurs} />
      </div>
    </div>
  );
}

/** Tableau de bord : uniquement des comptages, aucune donnée personnelle. */
export function Tableau() {
  const [t, setT] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { api('/admin/tableau').then(setT).catch((e) => setErr(e.message)); }, []);
  if (err) return <Alerte>{err}</Alerte>;
  if (!t) return <p className="muted">Chargement…</p>;
  const ser = (k: string) => t[k].map((x: any) => x.n) as number[];
  const jours = t.declarations.map((x: any) => x.jour) as string[];
  const nbEtat = (e: string) => t.parEtat.find((x: any) => x.etat === e)?.n ?? 0;
  const totalCorr = somme(t.parEtat.map((x: any) => x.n)), traitees = nbEtat('remise') + nbEtat('cloturee');
  const types = ['cni', 'permis', 'passeport'].map((k) => ({ nom: DOCS[k].nom, n: t.types.find((x: any) => x.type_document === k)?.n ?? 0, couleur: COULEUR_TYPE[k] }));
  const nbDocs = somme(types.map((x) => x.n));
  const max = Math.max(...ENTONNOIR.map(([e]) => nbEtat(e)), 1);
  const taux = totalCorr ? Math.round((traitees / totalCorr) * 100) : 0;
  return (
    <div className="tableau">
      <div className="entete-page"><div><h1>Tableau de bord</h1><p className="muted">Activité des 14 derniers jours. Les variations comparent les 7 derniers jours aux 7 précédents. Aucune donnée personnelle n'apparaît ici.</p></div>
        <Link className="btn p" to="/correspondances"><Icone nom="link" />Traiter les correspondances</Link></div>

      <div className="grille-kpi">
        <Kpi icone="users" titre="Comptes" valeurs={ser('comptes')} total={somme(ser('comptes'))} />
        <Kpi icone="doc" titre="Déclarations de perte" valeurs={ser('declarations')} total={somme(ser('declarations'))} />
        <Kpi icone="flag" titre="Documents signalés" valeurs={ser('signalements')} total={somme(ser('signalements'))} />
        <Kpi icone="link" titre="Correspondances" valeurs={ser('correspondances')} total={totalCorr} />
      </div>

      <div className="rangee r-2-1">
        <section className="carte"><div className="carte-tete"><h2>Déclarations et signalements</h2>
          <ul className="legende"><li><i style={{ background: 'var(--c1)' }} />Pertes déclarées</li><li><i style={{ background: 'var(--c2)' }} />Documents trouvés</li></ul></div>
          <Aire jours={jours} series={[{ nom: 'Pertes', valeurs: ser('declarations'), couleur: 'var(--c1)' }, { nom: 'Trouvés', valeurs: ser('signalements'), couleur: 'var(--c2)' }]}
            resume={`Sur 14 jours : ${somme(ser('declarations'))} pertes déclarées et ${somme(ser('signalements'))} documents trouvés.`} /></section>
        <section className="carte"><h2>Types de documents</h2>
          <div className="anneau-bloc"><Anneau parts={types} centre={String(nbDocs)} resume={types.map((x) => `${x.nom} : ${x.n}`).join(', ')} />
            <ul className="legende col">{types.map((x) => <li key={x.nom}><i style={{ background: x.couleur }} />{x.nom}<b>{nbDocs ? Math.round((x.n / nbDocs) * 100) : 0} %</b></li>)}</ul></div></section>
      </div>

      <div className="rangee r-2-1">
        <section className="carte"><div className="carte-tete"><h2>Correspondances récentes</h2><Link to="/correspondances" className="lien-voir">Tout voir</Link></div>
          {t.recentes.length === 0 ? <Vide>Aucune correspondance pour l'instant.</Vide> :
            <div className="defil"><table><thead><tr><th>Document</th><th>Date</th><th>Score</th><th>État</th></tr></thead><tbody>
              {t.recentes.map((c: any) => <tr key={c.id}><td><Doc type={c.type_document} /></td><td>{fdate(c.cree_le)}</td><td>{c.score}</td><td><Puce ton={c.etat === 'remise' || c.etat === 'cloturee' ? 'ok' : undefined}>{ETATS_CORR[c.etat]}</Puce></td></tr>)}
            </tbody></table></div>}</section>
        <section className="carte"><h2>Parcours des dossiers</h2>
          <ul className="entonnoir">{ENTONNOIR.map(([e, l]) => <li key={e}><div className="ligne espace"><span>{l}</span><b>{nbEtat(e)}</b></div>
            <div className="barre" role="presentation"><i style={{ width: `${(nbEtat(e) / max) * 100}%` }} /></div></li>)}</ul>
          <p className="muted petit">{taux} % des correspondances ont abouti à une remise.</p></section>
      </div>

      <div className="rangee r-1-1-1">
        <section className="carte"><h2>Activité récente</h2>
          {t.activite.length === 0 ? <Vide>Aucune action enregistrée.</Vide> :
            <ol className="fil">{t.activite.map((a: any) => <li key={a.id}><span className="fil-pt" /><div><b>{libelle(a.action)}</b><small>{a.compte ?? 'Système'} · {depuis(a.cree_le)}</small></div></li>)}</ol>}
          <Link to="/journal" className="lien-voir">Ouvrir le journal</Link></section>
        <section className="carte"><h2>Correspondances par jour</h2>
          <Barres jours={jours} valeurs={ser('correspondances')} resume={`${somme(ser('correspondances'))} correspondances proposées en 14 jours.`} /></section>
        <section className="carte"><h2>À traiter</h2>
          <ul className="taches">
            <li><span className="tache-n">{nbEtat('en_verification')}</span><div><b>À vérifier par un agent</b><small>Correspondances en attente</small></div></li>
            <li><span className="tache-n">{nbEtat('remise')}</span><div><b>À clôturer</b><small>Remise confirmée par les deux parties</small></div></li>
            <li><span className="tache-n tache-ok">{t.paiements.total}</span><div><b>FCFA encaissés</b><small>{t.paiements.n} paiements</small></div></li>
          </ul>
          <Link to="/correspondances" className="btn s" style={{ width: '100%' }}>Voir les correspondances</Link></section>
      </div>
    </div>
  );
}

export function AdminCorrespondances() {
  const [l, setL] = useState<any[] | null>(null); const [err, setErr] = useState('');
  const charger = useCallback(() => { api<any[]>('/admin/correspondances').then(setL).catch((e) => setErr(e.message)); }, []);
  useEffect(charger, [charger]);
  if (err) return <Alerte>{err}</Alerte>;
  if (!l) return <p className="muted">Chargement…</p>;
  if (!l.length) return <Vide>Aucune correspondance.</Vide>;
  return (
    <div className="carte defil"><table><thead><tr><th>Date</th><th>Score</th><th>État</th><th /></tr></thead><tbody>
      {l.map((c) => (
        <tr key={c.id}><td>{fdate(c.cree_le)}</td><td>{c.score}</td><td><Puce>{ETATS_CORR[c.etat]}</Puce></td>
          <td>{c.etat === 'remise' && <Action confirmer="Clôturer et effacer les données personnelles de ces deux dossiers ? Cette action est définitive." onClick={async () => { await api(`/admin/correspondances/${c.id}/cloturer`, { method: 'POST' }); charger(); }}>Clôturer et anonymiser</Action>}</td></tr>
      ))}
    </tbody></table></div>
  );
}

/** Retire une déclaration ou un signalement erroné ou frauduleux. Le motif est obligatoire et conservé dans le journal. */
function Retrait({ detail, apres }: { detail: any; apres: () => void }) {
  const [motif, setMotif] = useState('');
  return (
    <div style={{ marginTop: 16 }}>
      <Champ id="motif" label="Motif du retrait (enregistré dans le journal)" value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={200} />
      <Action ton="s" confirmer="Retirer définitivement ce contenu ? Les rapprochements en cours seront supprimés." onClick={async () => {
        if (motif.trim().length < 5) throw new Error('Indiquez un motif de 5 caractères au moins.');
        await api(`/admin/${detail.type}s/${detail.id}`, { method: 'DELETE', body: { motif: motif.trim() } });
        apres();
      }}>Retirer ce contenu</Action>
    </div>
  );
}

export function AdminRecherche() {
  const [q, setQ] = useState(''); const [r, setR] = useState<any>(null); const [err, setErr] = useState(''); const [detail, setDetail] = useState<any>(null);
  async function chercher(e: FormEvent) { e.preventDefault(); setErr(''); setDetail(null); try { setR(await api(`/admin/recherche?q=${encodeURIComponent(q)}`)); } catch (x: any) { setErr(x.message); } }
  async function ouvrir(type: string, id: string) { setErr(''); try { setDetail({ type, ...(await api(`/admin/${type}s/${id}`)) }); } catch (x: any) { setErr(x.message); } }
  const lignes = (l: any[]) => l.map((x) => (
    <tr key={x.id}><td><Doc type={x.type_document} /></td><td>{x.numero}</td><td>{x.nom}</td><td>{x.etat}</td>
      <td><button className="btn s" style={{ minHeight: 40 }} onClick={() => ouvrir(x.type, x.id)}>Voir le détail</button></td></tr>));
  return (
    <>
      <form className="ligne" onSubmit={chercher} style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 240px' }}><Champ id="q" label="Numéro ou nom" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn p" style={{ marginBottom: 14 }}>Rechercher</button>
      </form>
      {err && <Alerte>{err}</Alerte>}
      {r && (r.declarations.length + r.signalements.length === 0 ? <Vide>Aucun résultat.</Vide> :
        <div className="carte defil"><table><thead><tr><th>Document</th><th>Numéro</th><th>Nom</th><th>État</th><th /></tr></thead>
          <tbody>{lignes(r.declarations)}{lignes(r.signalements)}</tbody></table>
          <p className="muted" style={{ fontSize: 14, margin: '10px 0 0' }}>Les valeurs sont masquées. Ouvrir le détail est enregistré dans le journal.</p></div>)}
      {detail && (
        <div className="carte"><h3>Détail ({detail.type === 'declaration' ? 'déclaration' : 'signalement'})</h3>
          <Alerte type="warn">Cette consultation de données masquées est enregistrée dans le journal.</Alerte>
          <dl className="compare" style={{ gridTemplateColumns: '1fr' }}><div>
            {Object.entries(detail).filter(([k]) => !['id', 'compte_id', 'type', 'a_photo'].includes(k)).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v ?? '—')}</dd></div>)}
          </div></dl>
          {detail.a_photo && <PhotoVue chemin={`/admin/signalements/${detail.id}/photo`} />}
          <Retrait detail={detail} apres={() => { setDetail(null); setR(null); }} /></div>
      )}
    </>
  );
}

export function AdminComptes() {
  const [l, setL] = useState<any[] | null>(null); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [f, setF] = useState({ nom: '', prenom: '', email: '', telephone: '', motDePasse: '' });
  const charger = useCallback(() => { api<any[]>('/admin/comptes').then(setL).catch((e) => setErr(e.message)); }, []);
  useEffect(charger, [charger]);
  async function creer(e: FormEvent) {
    e.preventDefault(); setErr(''); setOk('');
    try { await api('/admin/agents', { body: f }); setOk('Agent créé.'); setF({ nom: '', prenom: '', email: '', telephone: '', motDePasse: '' }); charger(); } catch (x: any) { setErr(x.message); }
  }
  const maj = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <form className="carte" onSubmit={creer}>
        <h2>Créer un compte agent</h2>
        <div className="grille">
          <Champ id="an" label="Nom" required value={f.nom} onChange={maj('nom')} /><Champ id="ap" label="Prénom" required value={f.prenom} onChange={maj('prenom')} />
          <Champ id="ae" label="E-mail" type="email" required value={f.email} onChange={maj('email')} /><Champ id="at" label="Téléphone" type="tel" required value={f.telephone} onChange={maj('telephone')} />
          <Champ id="am" label="Mot de passe provisoire" type="password" required minLength={8} value={f.motDePasse} onChange={maj('motDePasse')} />
        </div>
        {err && <Alerte>{err}</Alerte>}{ok && <Alerte type="ok">{ok}</Alerte>}
        <button className="btn p">Créer l'agent</button>
      </form>
      <div className="carte defil"><table><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Statut</th><th /></tr></thead><tbody>
        {(l ?? []).map((c) => (
          <tr key={c.id}><td>{c.prenom} {c.nom}</td><td>{c.email}</td><td>{c.role}</td><td>{c.actif ? <Puce ton="ok">Actif</Puce> : <Puce ton="warn">Désactivé</Puce>}</td>
            <td>{c.role !== 'admin' && <Action ton="s" onClick={async () => { await api(`/admin/comptes/${c.id}/actif`, { method: 'PATCH', body: { actif: !c.actif } }); charger(); }}>{c.actif ? 'Désactiver' : 'Réactiver'}</Action>}</td></tr>
        ))}
      </tbody></table></div>
    </>
  );
}

export function AdminJournal() {
  const [l, setL] = useState<any[] | null>(null); const [a, setA] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { api<any[]>(`/admin/journal${a ? `?action=${a}` : ''}`).then(setL).catch((e) => setErr(e.message)); }, [a]);
  return (
    <>
      <div className="champ" style={{ maxWidth: 360 }}>
        <label htmlFor="fa">Filtrer</label>
        <select id="fa" value={a} onChange={(e) => setA(e.target.value)}>
          <option value="">Toutes les actions</option>
          <option value="consultation_donnees_masquees">Consultations de données masquées</option>
          <option value="consultation_coordonnees">Consultations de coordonnées</option>
          <option value="paiement_reussi">Paiements reçus</option>
          <option value="paiement_incoherent">Paiements incohérents</option>
          <option value="paiement_simule">Paiements simulés (anciennes démonstrations)</option>
          <option value="cloture_anonymisation">Clôtures</option>
        </select>
      </div>
      {err && <Alerte>{err}</Alerte>}
      {l && (l.length === 0 ? <Vide>Aucune entrée.</Vide> :
        <div className="carte defil"><table><thead><tr><th>Date</th><th>Compte</th><th>Action</th><th>Objet</th></tr></thead><tbody>
          {l.map((j) => <tr key={j.id}><td>{new Date(j.cree_le).toLocaleString('fr-FR')}</td><td>{j.compte ?? '—'}</td><td>{libelle(j.action)}</td><td>{j.objet_type ?? ''}</td></tr>)}
        </tbody></table></div>)}
    </>
  );
}

export function AdminMessages() {
  const [l, setL] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const charger = useCallback(() => { api<any[]>('/admin/contacts').then((x) => { setL(x); setErr(''); }).catch((e) => setErr(e.message)); }, []);
  useEffect(charger, [charger]);
  return (
    <>
      {err && <Alerte>{err}</Alerte>}
      {l === null ? <p className="muted">Chargement…</p> : l.length === 0 ? <Vide>Aucun message reçu par le formulaire de contact.</Vide> :
        l.map((m) => (
          <div className="carte" key={m.id}>
            <div className="ligne espace"><b>{m.sujet}</b><Puce ton={m.traite ? 'ok' : 'warn'}>{m.traite ? 'Traité' : 'À traiter'}</Puce></div>
            <p className="muted petit" style={{ margin: '4px 0 8px' }}>{m.nom} · <a href={`mailto:${m.email}`}>{m.email}</a> · {new Date(m.cree_le).toLocaleString('fr-FR')}</p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{m.message}</p>
            {!m.traite && <Action ton="s" onClick={async () => { await api(`/admin/contacts/${m.id}/traite`, { method: 'POST' }); charger(); }}>Marquer comme traité</Action>}
          </div>
        ))}
    </>
  );
}
