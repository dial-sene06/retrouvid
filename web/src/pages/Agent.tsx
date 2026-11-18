import { useCallback, useEffect, useState } from 'react';
import { api, fdate } from '../api';
import { Action, Alerte, Doc, Icone, PhotoVue, Puce, Stat, Vide } from '../ui';

const ETATS: Record<string, string> = { en_attente: 'Sans correspondance', en_verification: 'Correspondance en cours', remis: 'Remis' };

/** Liste de toutes les pertes ou de tous les documents trouvés, numéro masqué et nom. */
function ListeDossiers({ titre, l, lieu }: { titre: string; l: any[]; lieu: string }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2>{titre} ({l.length})</h2>
      {l.length === 0 ? <Vide>Aucun dossier ouvert.</Vide> : l.map((d) => (
        <div className="carte" key={d.id}>
          <div className="ligne espace"><Doc type={d.type_document} /><Puce ton={d.etat === 'en_attente' ? 'warn' : 'ok'}>{ETATS[d.etat] ?? d.etat}</Puce></div>
          <dl className="fiche-dossier">
            <div><dt>Numéro</dt><dd>{d.numero}</dd></div>
            <div><dt>Nom</dt><dd>{d.nom}</dd></div>
            <div><dt>{lieu}</dt><dd>{d.lieu}, le {fdate(d.date)}</dd></div>
          </dl>
          <small className="muted">Enregistré le {new Date(d.cree_le).toLocaleString('fr-FR')}</small>
        </div>
      ))}
    </section>
  );
}
import { CarteOsm, distanceTexte } from '../geo';

const CHAMPS: [string, string][] = [['numero', 'Numéro'], ['nom', 'Nom'], ['date_naissance', 'Naissance'], ['lieu', 'Lieu'], ['date', 'Date']];

function Fiche({ titre, f, concordants, cle }: { titre: string; f: any; concordants: string[]; cle: string }) {
  return (
    <div>
      <h3>{titre}</h3>
      <dl style={{ margin: 0 }}>
        {CHAMPS.map(([k, l]) => (
          <div key={k}>
            <dt>{l}{(k === 'numero' || k === 'nom' || k === 'date_naissance') && concordants.includes(k) && <span className="ok-champ"> ✓ concorde</span>}</dt>
            <dd>{k.startsWith('date') && f[k] ? fdate(f[k]) : (f[k] ?? '—')}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Agent() {
  const [file, setFile] = useState<any[] | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [err, setErr] = useState('');
  const charger = useCallback(() => {
    Promise.all([api<any[]>('/agent/correspondances'), api('/agent/stats')]).then(([l, s]) => { setFile(l); setStats(s); setErr(''); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(charger, [charger]);
  const [vue, setVue] = useState<'file' | 'tous'>('file');
  const [dossiers, setDossiers] = useState<{ pertes: any[]; trouves: any[] } | null>(null);
  useEffect(() => { if (vue === 'tous') api<{ pertes: any[]; trouves: any[] }>('/agent/dossiers').then(setDossiers).catch((e) => setErr(e.message)); }, [vue]);

  const onglets = (
    <div className="onglets" role="group" aria-label="Affichage">
      <button className={vue === 'file' ? 'actif' : ''} aria-pressed={vue === 'file'} onClick={() => setVue('file')}>À vérifier</button>
      <button className={vue === 'tous' ? 'actif' : ''} aria-pressed={vue === 'tous'} onClick={() => setVue('tous')}>Toutes les déclarations</button>
    </div>
  );
  if (vue === 'tous') return (
    <>
      <h1 className="titre-page">Toutes les déclarations</h1>
      <p className="muted">Pertes et documents trouvés encore ouverts. Chaque consultation est enregistrée dans le journal.</p>
      {onglets}
      {err && <Alerte>{err}</Alerte>}
      {dossiers === null ? <p className="muted">Chargement…</p> : <>
        <ListeDossiers titre="Pertes déclarées" l={dossiers.pertes} lieu="Perdu à" />
        <ListeDossiers titre="Documents trouvés" l={dossiers.trouves} lieu="Trouvé à" />
      </>}
    </>
  );

  return (
    <>
      <h1 className="titre-page">Correspondances à vérifier</h1>
      <p className="muted">Le numéro est masqué : seuls ses trois derniers caractères sont affichés. Chaque consultation est enregistrée dans le journal.</p>
      {onglets}
      {stats && (
        <div className="grille-kpi stats-agent">
          <Stat icone="shield" titre="À vérifier" valeur={stats.a_verifier} />
          <Stat icone="check" titre="Validées par moi" valeur={stats.validees} />
          <Stat icone="list" titre="Écartées par moi" valeur={stats.ecartees} />
        </div>
      )}
      {err && <Alerte>{err}</Alerte>}
      {file === null ? <p className="muted">Chargement…</p> : file.length === 0 ? <Vide>Aucune correspondance en attente.</Vide> :
        file.map((c) => (
          <div className="carte" key={c.id}>
            <div className="ligne espace"><Doc type={c.type_document} /><Puce ton={c.score >= 90 ? 'ok' : 'warn'}>Score {c.score}/100</Puce></div>
            <div className="compare" style={{ margin: '12px 0' }}>
              <Fiche titre="Déclaration" f={c.declaration} concordants={c.champs_concordants} cle="d" />
              <Fiche titre="Signalement" f={c.signalement} concordants={c.champs_concordants} cle="s" />
            </div>
            {c.distance_km != null && <p className="petit"><Icone nom="pin" /> Les deux lieux sont à {distanceTexte(c.distance_km)} l'un de l'autre (à vol d'oiseau, indicatif).</p>}
            {(c.declaration.lat != null || c.signalement.lat != null) && (
              <details className="cartes-agent">
                <summary>Voir les lieux sur la carte</summary>
                <div className="compare">
                  {c.declaration.lat != null && <div><h3>Lieu de perte</h3><CarteOsm pos={{ lat: c.declaration.lat, lng: c.declaration.lng }} titre="Lieu de perte" /></div>}
                  {c.signalement.lat != null && <div><h3>Lieu de découverte</h3><CarteOsm pos={{ lat: c.signalement.lat, lng: c.signalement.lng }} titre="Lieu de découverte" /></div>}
                </div>
              </details>
            )}
            {c.signalement.a_photo && <div style={{ marginBottom: 12 }}><PhotoVue chemin={`/agent/correspondances/${c.id}/photo`} /><p className="muted petit" style={{ margin: '6px 0 0' }}>La photo montre le document en clair. Son ouverture est enregistrée dans le journal.</p></div>}
            <div className="ligne">
              <Action onClick={async () => { await api(`/agent/correspondances/${c.id}/valider`, { method: 'POST' }); charger(); }}>Valider</Action>
              <Action ton="s" confirmer="Écarter cette correspondance ? Les deux dossiers resteront en attente." onClick={async () => { await api(`/agent/correspondances/${c.id}/ecarter`, { method: 'POST' }); charger(); }}>Écarter</Action>
            </div>
          </div>
        ))}
    </>
  );
}
