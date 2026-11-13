import { useEffect, useState } from 'react';
import { api, DOCS, fdate } from '../api';
import { Discussion } from '../discussion';
import { Alerte, Icone, Vide } from '../ui';

/** Liste des conversations ouvertes (paiement enregistré) et fil de la conversation choisie. */
export function Discussions() {
  const [l, setL] = useState<any[] | null>(null);
  const [choix, setChoix] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api<any[]>('/correspondances').then((x) => { const o = x.filter((c) => c.messagerie_ouverte); setL(o); setChoix(o[0]?.id ?? null); }).catch((e) => setErr(e.message));
  }, []);
  const lib = (c: any) => `${DOCS[c.type_document]?.nom ?? c.type_document} · ${c.cote === 'perte' ? "j'ai perdu" : "j'ai trouvé"}`;
  const cur = l?.find((c) => c.id === choix);
  return (
    <>
      <h1 className="titre-page">Discussions</h1>
      {err && <Alerte>{err}</Alerte>}
      {l === null ? <p className="muted">Chargement…</p> : l.length === 0 ?
        <Vide>Aucune discussion pour l'instant. Elle s'ouvre quand le propriétaire a payé pour obtenir les coordonnées : vous pouvez alors convenir de la remise.</Vide> : (
        <div className="discussions">
          <ul className="conversations" aria-label="Conversations">
            {l.map((c) => (
              <li key={c.id}><button className={c.id === choix ? 'actif' : ''} aria-current={c.id === choix} onClick={() => setChoix(c.id)}>
                <Icone nom="chat" /><span><b>{lib(c)}</b><small>{c.etat === 'remise' ? 'Remise confirmée' : 'Remise à organiser'}{c.date_trouve ? ` · trouvé le ${fdate(c.date_trouve)}` : ''}</small></span>
              </button></li>
            ))}
          </ul>
          <div className="carte fil-page">{cur && <Discussion key={cur.id} id={cur.id} />}</div>
        </div>
      )}
    </>
  );
}
