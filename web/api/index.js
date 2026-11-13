// Fonction Vercel : toutes les requêtes /api/* arrivent ici (voir vercel.json) et sont confiées à l'API NestJS,
// compilée pendant le build dans ../../api/dist. Le préfixe /api est retiré, comme le fait le proxy de Vite en local.
// Le paquet web est en ES modules, l'API compilée en CommonJS : createRequire fait le lien.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { serveurNest } = require('../../api/dist/src/serverless.js');

export default async function handler(req, res) {
  const app = await serveurNest();
  req.url = req.url.replace(/^\/api(?=\/|\?|$)/, '') || '/';
  return app(req, res);
}
