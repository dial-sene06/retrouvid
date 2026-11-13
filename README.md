# RetrouvID : prototype

PWA (React + TypeScript), API NestJS, base PostgreSQL. Paiement par Wave et Orange Money via PayDunya (mode test par défaut).

## Lancer en local (Windows, PowerShell)

Prérequis : Node.js 22, PostgreSQL 16, Git.

```powershell
# 0. psql dans le PATH, pour cette session
$env:Path += ";C:\Program Files\PostgreSQL\16\bin"

# 1. base de données (une seule fois, mot de passe de l'utilisateur postgres demandé)
psql -U postgres -c "CREATE USER retrouvid WITH PASSWORD 'retrouvid_dev';"
psql -U postgres -c "CREATE DATABASE retrouvid OWNER retrouvid;"
psql -U postgres -c "CREATE DATABASE retrouvid_test OWNER retrouvid;"

# 2. API
cd api
Copy-Item .env.example .env        # puis remplacer JWT_SECRET par une longue valeur aléatoire
npm install
npm run migrate; npm run seed      # schéma + 4 comptes de démonstration fictifs
npm start                          # http://localhost:3000

# 3. PWA (second terminal)
cd web; npm install; npm run dev   # http://localhost:5173
```

Sous Linux ou macOS, les commandes sont les mêmes, sans la ligne 0.

Comptes de démonstration (mot de passe `Demo12345`) : `citoyen@`, `citoyen2@`, `agent@`, `admin@retrouvid.test`.

## Connexion avec Google

Facultative : sans identifiant, le bouton n'apparaît pas et le reste de l'application fonctionne.

1. Sur https://console.cloud.google.com : créer un projet, puis « API et services », « Identifiants », « Créer des identifiants », « ID client OAuth », type « Application Web ».
2. Dans « Origines JavaScript autorisées », ajouter `http://localhost:5173` (et l'adresse `https` de l'application une fois hébergée). Google refuse les adresses IP du réseau local.
3. Copier l'ID client dans `api/.env` : `GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com`, puis relancer l'API.

Le jeton Google est vérifié côté serveur (signature, expiration, audience). Un compte créé avec un mot de passe n'est jamais rattaché automatiquement à un compte Google de même e-mail. Un nouveau compte Google demande le téléphone avant d'être créé.

## Vérification du téléphone (SMS simulé)

Un code à 6 chiffres est demandé avant la création d'un compte et à chaque connexion d'un citoyen, y compris avec Google. Les agents et l'administrateur, comptes internes créés par l'administration, se connectent avec leur seul mot de passe. Aucun SMS réel ne part : en mode `SMS_MODE=simulation` (par défaut), le code s'affiche dans l'encart « SMS simulé » de l'écran et dans le journal du serveur.

- `POST /auth/inscription`, `/auth/connexion` et `/auth/google` ne renvoient plus de jeton mais `{ verificationRequise, verificationId, telephone (masqué), codeSimule }`. `POST /auth/verification` (`verificationId`, `code`) crée le compte ou ouvre la session. `POST /auth/verification/renvoyer` envoie un nouveau code.
- À l'inscription, le compte n'existe pas tant que le code n'est pas saisi : ses informations attendent dans la table `verifications_telephone` (migration 009) et sont effacées dès l'usage.
- Le code est valable 10 minutes, sert une seule fois, tolère 5 essais et 3 envois. Il est stocké haché.
- `VERIF_TELEPHONE=non` dans `api/.env` coupe la vérification. Les tests existants l'utilisent ; `verification.spec.ts` (11 tests) couvre la vérification.
- Pour de vrais SMS, il reste à brancher un fournisseur dans `AuthService.envoyerSms` et à passer `SMS_MODE` à une autre valeur, ce qui retire le code de la réponse.

## Géolocalisation

Position GPS facultative sur les déclarations et les signalements. Le navigateur fournit les coordonnées (`navigator.geolocation`, avec l'accord de l'utilisateur), le serveur les convertit en adresse par le service Nominatim d'OpenStreetMap. Le navigateur n'appelle jamais Nominatim lui-même : le serveur espace ses appels d'une seconde (la politique d'usage du service public tolère une requête par seconde pour toute l'application), garde les résultats 24 heures en mémoire, envoie un `User-Agent` identifiable et répond « pas d'adresse » si le service est injoignable, ce qui laisse le formulaire utilisable. Le navigateur ne donne la position que sur une page en HTTPS (ou sur `localhost`), après accord de l'utilisateur.

- `GET /geo/inverse?lat=&lng=` : coordonnées vers adresse courte.
- `GET /geo/recherche?q=` : texte vers cinq lieux au plus, limités au pays `GEOCODE_PAYS` (`sn` par défaut).
- Variables : `GEOCODE_PAUSE_MS` (pause entre deux appels, 1000 par défaut), `GEOCODE_URL` (défaut `https://nominatim.openstreetmap.org`, à remplacer par une instance hébergée si le trafic augmente, la politique d'usage du service public l'impose) et `GEOCODE_PAYS`.
- Les cartes sont des `<iframe>` OpenStreetMap : aucune bibliothèque cartographique dans la PWA, mais elles exigent le réseau.
- La distance à vol d'oiseau entre le lieu de perte et le lieu de découverte (formule de haversine) est un indicateur pour l'agent et le propriétaire. Elle n'entre pas dans le score de rapprochement.
- Les coordonnées du lieu de découverte ne sont montrées au propriétaire qu'après validation par un agent. À la clôture, elles sont mises à `NULL`.

## Discussion, aide et accueil

- `GET/POST /correspondances/:id/messages` : discussion entre le propriétaire et le découvreur, ouverte seulement quand l'état est `payee` ou `remise`, 500 caractères par message, supprimée à la clôture. Le journal garde l'action `message_envoye`, jamais le texte.
- `GET /public/stats` : trois totaux et les cinq dernières restitutions (type de document et date, rien d'autre). `POST /public/contact` : formulaire de contact, cinq envois par minute au plus, lu par l'administrateur dans « Messages ».
- `PATCH /auth/mot-de-passe`, `POST /notifications/lues`, `DELETE /notifications/:id`, `DELETE /declarations/:id`, `PATCH` et `DELETE /signalements/:id`, `GET /citoyen/stats`, `GET /agent/stats`.
- Migration `006_geoloc_messagerie_contact.sql` : colonnes `lat`/`lng` sur `declarations` et `signalements`, tables `messages` et `contacts`.

## Écrans de la PWA

- Citoyen : Dossiers (avec recherche par type, lieu, numéro ou état), Perdu, Trouvé, Discussions (liste des conversations ouvertes après paiement et fil), Alertes, Aide, Profil et Réglages.
- Réglages : onglets Général, Mot de passe, Apparence (automatique, clair, sombre) et Application (état de la connexion, bouton d'installation).
- Le bouton d'installation n'apparaît que sur les navigateurs qui émettent `beforeinstallprompt` (Chrome, Edge). Sur Safari (iPhone), l'installation passe par « Ajouter à l'écran d'accueil ».

## Mise en production, sécurité et référencement

- **HTTPS** : `FORCE_HTTPS=true` dans `api/.env` redirige tout le trafic http vers https (308), active HSTS et refuse de démarrer si `CORS_ORIGIN` n'est pas en https. Le proxy TLS doit envoyer `X-Forwarded-Proto`. Un exemple complet (redirection 80 vers 443, en-têtes, cache, vrai code 404) est dans `deploy/nginx.conf`.
- **Aucune clé dans le navigateur** : tous les secrets (`JWT_SECRET`, `DATABASE_URL`) restent dans `api/.env`, ignoré par Git. Le géocodage passe par le serveur. `npm run build` termine par `scripts/verifier-secrets.mjs`, qui échoue si `dist/` contient une adresse de base de données, un nom de variable secrète ou une valeur de `api/.env`. Les identifiants `VITE_*` sont publics par conception.
- **Pages légales** : `/mentions-legales`, `/confidentialite`, `/cgu`. À l'inscription, la case d'acceptation est obligatoire et sa date est conservée (`comptes.cgu_acceptees_le`, migration 007). Compléter l'hébergeur dans les mentions légales à la mise en ligne.
- **Cookies et mesure d'audience** : l'application ne stocke que la session, le thème et le choix de consentement. La bannière apparaît à la première visite ; « Gérer mes choix » (pied de page) la rouvre. Avec `VITE_GA_ID`, Google Analytics 4 ne se charge qu'après acceptation, avec IP anonymisée, et ne compte que les pages publiques, jamais l'espace connecté.
- **Référencement** : un titre et une description par écran (`src/seo.tsx`), `noindex` sur l'espace connecté, aperçu de partage `og-image.jpg` (1200 x 630), favicon SVG, ICO et icône Apple. Avec `VITE_SITE_URL`, le build écrit `sitemap.xml` et ajoute la ligne `Sitemap` à `robots.txt`.
- **Anti-spam** : champ piège invisible sur l'inscription et le formulaire de contact (le contact répond comme si le message était reçu, sans l'enregistrer), limite de 5 messages par minute et par adresse, validation côté serveur.
- **Vitesse** : polices servies par l'application (plus de Google Fonts), écrans de l'agent et de l'administrateur chargés à la demande, fond d'illustration en deux tailles (WebP). Lighthouse sur la version de production (13/11/2026) : performance 96 sur ordinateur et 61 sur mobile, accessibilité, bonnes pratiques et SEO à 100. Sur mobile, les animations de la page d’accueil occupent le processeur au chargement.

## Tests

`cd api && npm test` : 75 tests (73 exécutés) sur 9 fichiers, dont 16 pour le paiement PayDunya (`paydunya.spec.ts`, avec un faux serveur PayDunya : aucun appel réseau) et 11 pour la vérification du téléphone (`verification.spec.ts`). La base `retrouvid_test` est recréée à chaque fichier. Les deux tests de mesure de performance restent ignorés par défaut.

- `scenario.spec.ts` : parcours complet, ordre des étapes, contrôle d'accès, photo, Google.
- `complements.spec.ts` : modification du profil, correction d'une déclaration, retrait de contenu par l'administrateur.
- `enf.spec.ts` : exigences de sécurité (bcrypt coût 12, jeton expiré, cloisonnement des rôles, coordonnées refusées sans les trois conditions, aucune donnée de paiement, anonymisation, journal).
- `extras.spec.ts` : position GPS et distance, géocodage simulé (succès et service injoignable), correction et suppression des dossiers, discussion après paiement et effacement à la clôture, changement de mot de passe, chiffres publics et formulaire de contact, alertes, statistiques.
- `limite.spec.ts` : onzième connexion de la minute refusée (429).

Mesure de performance (volume de 5 000 déclarations et 5 000 signalements) : `MESURE=1 npx jest test/mesure.spec.ts --runInBand`.

## Sauvegarde et restauration

```bash
DATABASE_URL=postgres://... ./scripts/sauvegarde.sh sauvegardes      # fichier .sql.gz daté, 14 conservés
DATABASE_URL=postgres://... ./scripts/restauration.sh sauvegardes/retrouvid-AAAAMMJJ-HHMMSS.sql.gz
```

Les scripts utilisent `pg_dump` et `psql` (PostgreSQL 16). La restauration remplace le contenu de la base visée.

## Ajouter un type de document

Trois endroits : `api/src/common/mask.ts` (liste `TYPES`), une migration qui élargit la contrainte `CHECK` des deux tables,
`web/src/api.ts` (objet `DOCS`). Les listes déroulantes de l'interface se construisent à partir de `DOCS`.

## Règles de gestion

- Un seul profil pour les utilisateurs : la même personne peut déclarer la perte d'un document et signaler celui d'un autre. Elle est « propriétaire » sur ses déclarations et « découvreur » sur ses signalements. Une personne ne peut pas être rapprochée de son propre signalement.
- Le rapprochement est automatique : numéro identique (50 points), nom identique (40), date de naissance identique (10). Seuil : 40.
- L'agent voit des valeurs partiellement masquées et ne fait que valider ou écarter.
- Le citoyen confirme à son tour, paie 1 000 FCFA sur la page PayDunya (Wave ou Orange Money), puis reçoit les coordonnées du découvreur une fois le paiement confirmé par PayDunya.
- La remise est confirmée par les deux parties, puis l'administrateur clôture et anonymise.
- Chaque consultation de données masquées par l'administrateur est écrite dans le journal.
- Une déclaration se corrige ou se supprime, et un signalement se supprime, tant qu'aucun rapprochement n'a été proposé (le signalement se corrige par l'API ; l'écran n'offre que la suppression, car le numéro et le nom saisis ne sont jamais renvoyés au découvreur).
- Une déclaration se corrige tant qu'aucun rapprochement n'a été proposé. Le profil (nom, prénom, téléphone) se modifie à tout moment.
- L'administrateur peut retirer une déclaration ou un signalement erroné ou frauduleux, avec un motif obligatoire. Le retrait est refusé dès qu'un paiement a abouti.

## Paiement PayDunya (Wave, Orange Money)

Le citoyen paie 1 000 FCFA (constante `montantCoordonnees`, côté serveur) après la validation de l'agent puis la sienne. Le serveur crée une facture PayDunya (`POST /checkout-invoice/create`), renvoie l'adresse de la page de paiement, et le navigateur y est redirigé. PayDunya affiche Wave et Orange Money (`PAYDUNYA_CANAUX`) ; RetrouvID ne voit jamais le numéro de paiement.

Le résultat n'est jamais lu dans l'adresse de retour ni dans le corps d'une notification : le serveur interroge PayDunya (`GET /checkout-invoice/confirm/<jeton>`), vérifie que le statut est `completed`, que le montant vaut 1 000 et que la facture porte bien l'identifiant de la correspondance, puis seulement passe le dossier à `payee`. Deux chemins mènent à cette même vérification, rejouable sans effet : la notification IPN (`POST /paiements/paydunya/ipn`, empreinte SHA-512 de la clé maître comparée en temps constant) et la page de retour `/paiement/retour/:id`. Un double clic réutilise la même facture (verrou par correspondance). Les clés sont dans `api/.env` ; sans elles, l'API répond 503 et l'écran indique que le paiement n'est pas ouvert.

Mise en route :

1. Créer une application sur PayDunya (tableau de bord, Intégrer, Configurer une application) et copier les trois clés **test** dans `api/.env` : `PAYDUNYA_MASTER_KEY`, `PAYDUNYA_PRIVATE_KEY`, `PAYDUNYA_TOKEN`, avec `PAYDUNYA_MODE=test`.
2. Renseigner `APP_URL` (adresse de la PWA) et, en ligne, `API_PUBLIC_URL` (adresse HTTPS de l'API) pour recevoir la notification IPN. En local, laisser `API_PUBLIC_URL` vide : le paiement est confirmé au retour sur la page de suivi.
3. Payer en mode test avec les numéros de test fournis par PayDunya, vérifier le passage à « Coordonnées », puis changer pour les clés **live** et `PAYDUNYA_MODE=live`.
4. Vérifier avec PayDunya les noms de canaux (`wave-senegal`, `orange-money-senegal`) activés sur votre compte ; une valeur inconnue fait refuser la facture.

Si une notification est perdue, la page de retour ou un nouveau clic sur « Payer » rattrape le paiement. Une facture annulée ou expirée permet une nouvelle tentative.

## Choix de sécurité

- Mots de passe hachés avec bcrypt (coût 12), longueur limitée à 72 caractères.
- Jeton JWT signé en HS256, algorithme imposé à la vérification, durée 8 h. Le compte est rechargé à chaque requête : un compte désactivé perd l'accès immédiatement.
- Rôles vérifiés côté serveur sur chaque route. Entrées validées (liste blanche, champs inconnus refusés).
- Requêtes SQL paramétrées uniquement. Limite de requêtes globale et plus stricte sur la connexion.
- Message d'erreur identique et temps de réponse équivalent quand l'e-mail n'existe pas.

## Écarts connus

- Les e-mails sont simulés : ils apparaissent dans les journaux du serveur.
- Le paiement PayDunya fonctionne en mode test (sandbox) : un paiement réel de bout en bout a été confirmé par PayDunya et a débloqué les coordonnées. Le passage en mode live demande un compte marchand validé par PayDunya (section « Paiement PayDunya »).
- Les SMS de vérification sont simulés (`SMS_MODE=simulation`) : le code s'affiche à l'écran. Un envoi réel demande un fournisseur SMS (Orange SMS API, Twilio…).
- L'application n'est pas encore hébergée : `deploy/nginx.conf` prépare la mise en ligne, mais il manque le serveur, le nom de domaine et le certificat HTTPS.
- Le jeton est gardé dans le stockage local du navigateur (pratique pour une PWA, exposé en cas de faille XSS). Un cookie httpOnly serait la suite logique.
- La PWA est installable ; le mode hors ligne se limite à l'interface, les données exigent le réseau.
