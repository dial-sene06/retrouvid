import { useEffect, useRef } from 'react';

/**
 * Faisceaux de fils lumineux qui ondulent lentement, dessinés dans un canvas.
 * « croix » : deux faisceaux qui se croisent au centre (en-tête du site de référence) ;
 * « vague » : un faisceau qui balaie la zone en diagonale (pied du site de référence).
 * Économe : l'animation ne tourne que si le canvas est visible et l'onglet actif, la densité de pixels est plafonnée à 2,
 * et une seule image fixe est dessinée quand le système demande moins de mouvement.
 */
type Forme = 'croix' | 'vague';

// sauge, menthe pâle, vert lumineux : les teintes des trois verts du projet, éclaircies pour briller sur fond sombre
const TEINTES = ['143,191,165', '214,240,225', '96,214,150'];

function dessiner(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, forme: Forme) {
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 1;
  const n = w < 640 ? 16 : 26;
  const pas = w < 640 ? 8 : 6;
  const faisceaux = forme === 'croix' ? [1, -1] : [1];

  for (const sens of faisceaux) {
    for (let i = 0; i < n; i++) {
      const o = i / (n - 1) - 0.5;
      const eclat = 0.12 + 0.55 * Math.pow(1 - Math.abs(o) * 2, 2);
      ctx.strokeStyle = `rgba(${TEINTES[i % TEINTES.length]},${eclat.toFixed(3)})`;
      ctx.beginPath();
      for (let x = -pas; x <= w + pas; x += pas) {
        const u = (x - w / 2) / (w / 2);
        let y: number;
        if (forme === 'croix') {
          // pincé au centre, évasé vers les coins : les deux faisceaux forment un X
          const base = sens * h * 0.36 * Math.sin((u * Math.PI) / 2);
          const ecart = 4 + 64 * u * u;
          const houle = Math.sin(u * 2.4 + t * 0.7 * sens + i * 0.22) * (5 + 18 * u * u) + Math.sin(t * 0.4 + i * 0.5) * 3;
          y = h / 2 + base + o * ecart + houle + Math.sin(t * 0.5) * h * 0.02 * sens;
        } else {
          // monte du coin bas gauche vers le coin haut droit en s'élargissant
          const v = (u + 1) / 2;
          const base = -h * 0.32 * u - h * 0.08 * Math.sin(u * Math.PI);
          const ecart = 8 + 70 * v * v;
          const houle = Math.sin(u * 3 + t * 0.8 + i * 0.18) * (6 + 16 * v) + Math.sin(t * 0.35 + i * 0.4) * 4;
          y = h * 0.56 + base + o * ecart + houle;
        }
        if (x === -pas) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  // halo doux là où les fils se resserrent
  const cx = forme === 'croix' ? w / 2 : w * 0.62, cy = forme === 'croix' ? h / 2 : h * 0.42;
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.32);
  halo.addColorStop(0, 'rgba(143,191,165,0.16)');
  halo.addColorStop(1, 'rgba(143,191,165,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}

export function Rubans({ forme = 'croix', className = '' }: { forme?: Forme; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const calme = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const debut = performance.now();
    let w = 0, h = 0, id = 0, visible = false;

    const instant = () => (calme ? 2 : (performance.now() - debut) / 1000);
    const redimensionner = () => {
      const r = c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dessiner(ctx, w, h, instant(), forme);
    };
    const boucle = () => { dessiner(ctx, w, h, instant(), forme); id = requestAnimationFrame(boucle); };
    const lancer = () => { if (!id && visible && !document.hidden && !calme) id = requestAnimationFrame(boucle); };
    const arreter = () => { cancelAnimationFrame(id); id = 0; };

    const taille = new ResizeObserver(redimensionner);
    taille.observe(c);
    const vue = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) lancer(); else arreter(); });
    vue.observe(c);
    const onglet = () => (document.hidden ? arreter() : lancer());
    document.addEventListener('visibilitychange', onglet);
    redimensionner();

    return () => { arreter(); taille.disconnect(); vue.disconnect(); document.removeEventListener('visibilitychange', onglet); };
  }, [forme]);

  return <canvas ref={ref} className={`rubans ${className}`.trim()} aria-hidden="true" />;
}
