import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Alerte, Icone } from './ui';

/** Messagerie entre le propriétaire et la personne qui a trouvé le document. Le serveur ne l'ouvre qu'après paiement. */
export function Discussion({ id }: { id: string }) {
  const [l, setL] = useState<any[] | null>(null);
  const [t, setT] = useState(''); const [err, setErr] = useState(''); const [occupe, setOccupe] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const charger = useCallback(() => { api<any[]>(`/correspondances/${id}/messages`).then((x) => { setL(x); setErr(''); }).catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => { charger(); const i = setInterval(charger, 15000); return () => clearInterval(i); }, [charger]);
  useEffect(() => { fin.current?.scrollIntoView?.({ block: 'nearest' }); }, [l?.length]);

  async function envoyer(e: FormEvent) {
    e.preventDefault(); if (!t.trim()) return;
    setOccupe(true); setErr('');
    try { await api(`/correspondances/${id}/messages`, { body: { texte: t.trim() } }); setT(''); charger(); }
    catch (x: any) { setErr(x.message); } finally { setOccupe(false); }
  }
  return (
    <section className="discussion" aria-label="Discussion">
      <h3><Icone nom="chat" />Discussion</h3>
      <div className="fil-messages" aria-live="polite">
        {l === null ? <p className="muted petit">Chargement…</p> : l.length === 0 ? <p className="muted petit">Aucun message. Convenez ici du lieu et de l'heure de la remise.</p> :
          l.map((m) => (
            <p key={m.id} className={m.moi ? 'msg moi' : 'msg'}>
              {m.texte}<small>{new Date(m.cree_le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>
            </p>
          ))}
        <div ref={fin} />
      </div>
      <form className="envoi-message" onSubmit={envoyer}>
        <label htmlFor={`m-${id}`} className="sr">Votre message</label>
        <input id={`m-${id}`} value={t} maxLength={500} placeholder="Votre message" onChange={(e) => setT(e.target.value)} />
        <button className="btn p" disabled={occupe || !t.trim()} aria-label="Envoyer"><Icone nom="send" /></button>
      </form>
      {err && <Alerte>{err}</Alerte>}
      <p className="muted petit">Les messages sont supprimés à la clôture du dossier.</p>
    </section>
  );
}
