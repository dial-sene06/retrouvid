import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

const PUBLIQUES = ['/', '/inscription', '/confidentialite', '/mentions-legales', '/cgu'];

/**
 * VITE_SITE_URL (adresse publique du site, sans barre finale) alimente les adresses absolues exigées par les aperçus de partage,
 * et sert à écrire sitemap.xml et la ligne Sitemap de robots.txt. Sans elle, les adresses restent relatives et aucun sitemap n'est écrit :
 * on n'invente pas de nom de domaine.
 */
function referencement(siteUrl: string): Plugin {
  return {
    name: 'referencement',
    transformIndexHtml: (html) => (siteUrl
      ? html.replaceAll('%SITE_URL%', siteUrl)
      : html.replace(/\s*<meta property="og:url"[^>]*>/, '').replaceAll('%SITE_URL%', '')),
    closeBundle() {
      if (!siteUrl) return;
      const date = new Date().toISOString().slice(0, 10);
      const urls = PUBLIQUES.map((p) => `  <url><loc>${siteUrl}${p}</loc><lastmod>${date}</lastmod></url>`).join('\n');
      writeFileSync(resolve('dist/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
      writeFileSync(resolve('dist/robots.txt'), `${readFileSync(resolve('public/robots.txt'), 'utf8')}\nSitemap: ${siteUrl}/sitemap.xml\n`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const siteUrl = (loadEnv(mode, process.cwd(), 'VITE_').VITE_SITE_URL ?? '').replace(/\/$/, '');
  return {
  build: { chunkSizeWarningLimit: 400 },
  plugins: [
    react(),
    referencement(siteUrl),
    VitePWA({
      registerType: 'autoUpdate',
      // l'enregistrement du service worker ne doit pas retarder le premier affichage
      injectRegister: 'script-defer',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'RetrouvID', short_name: 'RetrouvID', lang: 'fr',
        description: "Retrouver une pièce d'identité perdue, sans exposer ses données.",
        theme_color: '#0b3d24', background_color: '#f8fbf9', display: 'standalone', start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // registerSW.js (script-defer) ne fait qu'enregistrer le service worker : sans ces deux options, une nouvelle version
      // resterait en attente tant que tous les onglets du site ne sont pas fermés
      workbox: { skipWaiting: true, clientsClaim: true, navigateFallbackDenylist: [/^\/api/, /\/(sitemap\.xml|robots\.txt)$/], globIgnores: ['**/og-image.jpg'], runtimeCaching: [] },
    }),
  ],
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } } },
};
});
