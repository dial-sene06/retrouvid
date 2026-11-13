import { useEffect, useState } from 'react';
import { api } from '../api';
import { Alerte, Icone, Vide } from '../ui';

type Filtre = 'toutes' | 'non_lues' | 'lues';
const FILTRES: [Filtre, string][] = [['toutes', 'Toutes'], ['non_lues', 'Non lues'], ['lues', 'Lues']];

export function Notifications({ onChange }: { onChange: () => void }) {
  const [l, setL] = useState<any[] | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [err, setErr] = useState('');
  useEffect(() => { api<any[]>('/notifications').then(setL).catch((e) => setErr(e.message)); }, []);

  async function lire(id: string) {
    await api(`/notifications/${id}/lue`, { method: 'POST' }).catch(() => {});
    setL((x) => x && x.map((n) => (n.id === id ? { ...n, lue: true } : n))); onChange();
  }
  async function toutLire() {
    setErr('');
    try { await api('/notifications/lues', { method: 'POST' }); setL((x) => x && x.map((n) => ({ ...n, lue: true }))); onChange(); }
    catch (e: any) { setErr(e.message); }
  }
  async function supprimer(id: string) {
    setErr('');
    try { await api(`/notifications/${id}`, { method: 'DELETE' }); setL((x) => x && x.filter((n) => n.id !== id)); onChange(); }
    catch (e: any) { setErr(e.message); }
  }

  const nonLues = l?.filter((n) => !n.lue).length ?? 0;
  const visibles = (l ?? []).filter((n) => filtre === 'toutes' || (filtre === 'lues' ? n.lue : !n.lue));
  return (
    <>
      <div className="entete-page">
        <div><h1>Alertes</h1><p className="muted">{nonLues > 0 ? `${nonLues} non lue${nonLues > 1 ? 's' : ''}` : 'Tout est lu.'}</p></div>
        {nonLues > 0 && <button className="btn s" onClick={toutLire}><Icone nom="check" />Tout marquer comme lu</button>}
      </div>
      <div className="onglets" role="group" aria-label="Filtrer les alertes">
        {FILTRES.map(([k, t]) => <button key={k} className={filtre === k ? 'actif' : ''} aria-pressed={filtre === k} onClick={() => setFiltre(k)}>{t}</button>)}
      </div>
      {err && <Alerte>{err}</Alerte>}
      {l === null ? <p className="muted">Chargement…</p> : visibles.length === 0 ? <Vide>{l.length === 0 ? "Aucune alerte pour l'instant." : 'Aucune alerte dans ce filtre.'}</Vide> :
        visibles.map((n) => (
          <div className="carte" key={n.id} style={{ borderColor: n.lue ? undefined : 'var(--accent)' }}>
            <p style={{ margin: 0, fontWeight: n.lue ? 400 : 700 }}>{n.message}</p>
            <div className="ligne espace" style={{ marginTop: 6 }}>
              <small className="muted">{new Date(n.cree_le).toLocaleString('fr-FR')}</small>
              <span className="ligne">
                {!n.lue && <button className="btn s" style={{ minHeight: 40 }} onClick={() => lire(n.id)}>Marquer comme lue</button>}
                <button className="btn s" style={{ minHeight: 40 }} onClick={() => supprimer(n.id)} aria-label="Supprimer cette alerte"><Icone nom="trash" /></button>
              </span>
            </div>
          </div>
        ))}
    </>
  );
}
