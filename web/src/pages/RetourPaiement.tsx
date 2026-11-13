import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Alerte, Page } from '../ui';

interface Retour { statut: 'aucun' | 'en_attente' | 'reussi' | 'echoue' | 'annule'; etat: string }

/** Atterrissage après la page de paiement PayDunya. Le résultat n'est jamais lu dans l'adresse : on le demande au serveur, qui interroge PayDunya. */
export function RetourPaiement() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [r, setR] = useState<Retour | null>(null);
  const [err, setErr] = useState('');
  const essais = useRef(0);

  const verifier = useCallback(async () => {
    try { setR(await api<Retour>(`/correspondances/${id}/paiement`)); setErr(''); } catch (e: any) { setErr(e.message); }
  }, [id]);

  useEffect(() => { verifier(); }, [verifier]);
  // Wave et Orange Money confirment parfois quelques secondes après le retour : on revérifie un peu, puis on laisse le bouton
  useEffect(() => {
    if (r?.statut !== 'en_attente' || params.get('annule') || essais.current >= 8) return;
    const t = setTimeout(() => { essais.current += 1; verifier(); }, 4000);
    return () => clearTimeout(t);
  }, [r, params, verifier]);

  return (
    <Page titre="Paiement">
      {err && <Alerte>{err}</Alerte>}
      {!r && !err && <p className="muted" role="status">Vérification de votre paiement auprès de PayDunya…</p>}
      {r?.statut === 'reussi' && <>
        <Alerte type="ok">Paiement reçu. Les coordonnées de la personne qui a trouvé votre document sont affichées sur votre dossier, et la discussion est ouverte.</Alerte>
        <p><Link className="btn p" to="/">Voir mon dossier</Link></p>
      </>}
      {r?.statut === 'en_attente' && <>
        <Alerte type="info">{params.get('annule') ? "Vous avez quitté la page de paiement. Rien n'a été prélevé." : "Votre paiement n'est pas encore confirmé. Si vous venez de valider sur Wave ou Orange Money, patientez quelques secondes."}</Alerte>
        <p className="ligne"><button className="btn s" onClick={verifier}>Vérifier à nouveau</button><Link className="btn s" to="/">Retour à mes dossiers</Link></p>
      </>}
      {(r?.statut === 'annule' || r?.statut === 'echoue') && <>
        <Alerte type="warn">{r.statut === 'annule' ? "Le paiement a été annulé. Rien n'a été prélevé." : "Le paiement n'a pas abouti. Si une somme a été débitée, elle sera remboursée par votre opérateur ; vous pouvez aussi nous écrire depuis l'aide."}</Alerte>
        <p><Link className="btn p" to="/">Retour à mes dossiers pour réessayer</Link></p>
      </>}
      {r?.statut === 'aucun' && <Alerte type="info">Aucun paiement n'est en cours pour ce dossier. <Link to="/">Retour à mes dossiers</Link></Alerte>}
    </Page>
  );
}
