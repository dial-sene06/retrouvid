import { useEffect, useId, useRef, useState } from 'react';

/* Graphiques SVG sans dépendance : légers, lisibles au clavier et au lecteur d'écran (résumé dans aria-label). */

/** Mesure la largeur réelle du conteneur pour que les textes du graphique gardent leur taille. */
function useLargeur(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null); const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    setW(Math.max(260, el.clientWidth));
    const o = new ResizeObserver(() => setW(Math.max(260, el.clientWidth))); o.observe(el);
    return () => o.disconnect();
  }, []);
  return [ref, w];
}
const jour = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
export const somme = (v: number[]) => v.reduce((a, x) => a + x, 0);

/** Variation en % des 7 derniers jours par rapport aux 7 précédents. */
export function variation(v: number[]) {
  const a = somme(v.slice(-7)), b = somme(v.slice(-14, -7));
  if (b === 0) return a === 0 ? 0 : 100;
  return Math.round(((a - b) / b) * 100);
}

function lisse(pts: [number, number][]) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

export function Sparkline({ valeurs, couleur = 'var(--c1)' }: { valeurs: number[]; couleur?: string }) {
  const id = useId(), W = 120, H = 36, max = Math.max(...valeurs, 1);
  const pts: [number, number][] = valeurs.map((v, i) => [(i / (valeurs.length - 1)) * W, H - 3 - (v / max) * (H - 8)]);
  const l = lisse(pts);
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={couleur} stopOpacity=".35" /><stop offset="1" stopColor={couleur} stopOpacity="0" /></linearGradient></defs>
      <path d={`${l} L${W},${H} L0,${H}Z`} fill={`url(#${id})`} />
      <path d={l} fill="none" stroke={couleur} strokeWidth="1.8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export interface Serie { nom: string; valeurs: number[]; couleur: string }

export function Aire({ jours, series, resume }: { jours: string[]; series: Serie[]; resume: string }) {
  const [ref, W] = useLargeur(); const id = useId(), H = 240, G = 34, B = 26, max = Math.max(...series.flatMap((s) => s.valeurs), 1);
  const haut = Math.ceil(max / 4) * 4 || 4, x = (i: number) => G + (i / (jours.length - 1)) * (W - G - 8), y = (v: number) => H - B - (v / haut) * (H - B - 10);
  const pasX = W < 480 ? 5 : 3;
  return (
    <div ref={ref}><svg className="graph" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={resume}>
      <defs>{series.map((s, k) => <linearGradient key={k} id={`${id}${k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.couleur} stopOpacity=".32" /><stop offset="1" stopColor={s.couleur} stopOpacity="0" /></linearGradient>)}</defs>
      {[0, 1, 2, 3, 4].map((t) => { const v = (haut / 4) * t; return <g key={t}><line x1={G} x2={W - 8} y1={y(v)} y2={y(v)} className="grille-h" /><text x={G - 8} y={y(v) + 4} textAnchor="end" className="axe">{Math.round(v)}</text></g>; })}
      {jours.map((j, i) => i % pasX === 0 ? <text key={j} x={x(i)} y={H - 6} textAnchor="middle" className="axe">{jour(j)}</text> : null)}
      {series.map((s, k) => {
        const pts: [number, number][] = s.valeurs.map((v, i) => [x(i), y(v)]), l = lisse(pts);
        return <g key={k}><path d={`${l} L${x(jours.length - 1)},${y(0)} L${x(0)},${y(0)}Z`} fill={`url(#${id}${k})`} /><path d={l} fill="none" stroke={s.couleur} strokeWidth="2.2" strokeLinecap="round" /></g>;
      })}
    </svg></div>
  );
}

export function Barres({ jours, valeurs, resume, couleur = 'var(--c1)' }: { jours: string[]; valeurs: number[]; resume: string; couleur?: string }) {
  const [ref, W] = useLargeur(); const H = 200, G = 28, B = 26, max = Math.max(...valeurs, 1), haut = Math.ceil(max / 2) * 2 || 2, pas = (W - G - 8) / valeurs.length, l = Math.min(26, pas * 0.6);
  const y = (v: number) => H - B - (v / haut) * (H - B - 10);
  return (
    <div ref={ref}><svg className="graph" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={resume}>
      {[0, 1, 2].map((t) => { const v = (haut / 2) * t; return <g key={t}><line x1={G} x2={W - 8} y1={y(v)} y2={y(v)} className="grille-h" /><text x={G - 8} y={y(v) + 4} textAnchor="end" className="axe">{Math.round(v)}</text></g>; })}
      {valeurs.map((v, i) => { const cx = G + pas * i + pas / 2; return <g key={i}><rect x={cx - l / 2} y={y(v)} width={l} height={Math.max(y(0) - y(v), v ? 2 : 0)} rx="4" fill={couleur} opacity={i === valeurs.length - 1 ? 1 : 0.75} />{i % (W < 480 ? 4 : 3) === 0 && <text x={cx} y={H - 6} textAnchor="middle" className="axe">{jour(jours[i])}</text>}</g>; })}
    </svg></div>
  );
}

export function Anneau({ parts, centre, resume }: { parts: { nom: string; n: number; couleur: string }[]; centre: string; resume: string }) {
  const total = Math.max(somme(parts.map((p) => p.n)), 1), R = 54, C = 2 * Math.PI * R;
  let cumul = 0;
  return (
    <svg className="anneau" viewBox="0 0 140 140" role="img" aria-label={resume}>
      <circle cx="70" cy="70" r={R} fill="none" className="anneau-fond" strokeWidth="16" />
      {parts.map((p) => { const len = (p.n / total) * C, o = -cumul; cumul += len; return <circle key={p.nom} cx="70" cy="70" r={R} fill="none" stroke={p.couleur} strokeWidth="16" strokeDasharray={`${Math.max(len - 3, 0)} ${C}`} strokeDashoffset={o} transform="rotate(-90 70 70)" />; })}
      <text x="70" y="68" textAnchor="middle" className="anneau-n">{centre}</text>
      <text x="70" y="86" textAnchor="middle" className="axe">documents</text>
    </svg>
  );
}
