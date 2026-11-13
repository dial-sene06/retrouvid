// Contrôle après build : aucune clé ni adresse interne ne doit se trouver dans les fichiers servis au navigateur.
// Un identifiant client Google ou de mesure d'audience est public par conception ; un secret, un mot de passe ou une URL de base de données ne l'est jamais.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath et non .pathname : sous Windows, .pathname donne « /C:/… », que Node lit comme « C:\C:\… ».
const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const MOTIFS = [
  [/postgres(ql)?:\/\/[^\s"']+/i, "adresse de base de données"],
  [/JWT_SECRET|DATABASE_URL|GOOGLE_CLIENT_SECRET|PAYDUNYA_(MASTER_KEY|PRIVATE_KEY|TOKEN)/, 'nom de variable secrète'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clé privée'],
  [/GOCSPX-[\w-]{10,}/, 'secret client Google'],
  [/sk_live_[\w]{10,}|AKIA[0-9A-Z]{16}/, 'clé de service payant'],
];
// Valeurs réelles du fichier .env de l'API, si présent : on cherche leur trace exacte dans le build.
const env = new URL('../../api/.env', import.meta.url);
const valeurs = existsSync(env)
  ? readFileSync(env, 'utf8').split(/\r?\n/).map((l) => l.match(/^(JWT_SECRET|DATABASE_URL|GOOGLE_CLIENT_SECRET|PAYDUNYA_MASTER_KEY|PAYDUNYA_PRIVATE_KEY|PAYDUNYA_TOKEN)=(.{8,})$/)).filter(Boolean).map((m) => m[2].trim())
  : [];

function fichiers(d) { return readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? fichiers(p) : [p]; }); }
let trouve = 0;
for (const f of fichiers(DIST)) {
  if (/\.(png|jpe?g|webp|ico|woff2?)$/.test(f)) continue;
  const t = readFileSync(f, 'utf8');
  for (const [re, nom] of MOTIFS) if (re.test(t)) { console.error(`✗ ${f.replace(DIST, 'dist')} : ${nom}`); trouve++; }
  for (const v of valeurs) if (t.includes(v)) { console.error(`✗ ${f.replace(DIST, 'dist')} : valeur du fichier .env de l'API`); trouve++; }
}
if (trouve) { console.error(`${trouve} problème(s) : le build ne doit pas être publié.`); process.exit(1); }
console.log(`✓ aucun secret dans dist (${fichiers(DIST).length} fichiers, ${valeurs.length} valeur(s) d'.env recherchée(s))`);
