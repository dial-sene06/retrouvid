import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useConsentement } from '../consentement';

const MAJ = '2 novembre 2026';

export function PiedSite() {
  const { rouvrir } = useConsentement();
  return (
    <footer className="pied-site">
      <Link to="/" className="logo">Retrouv<span>ID</span></Link>
      <p>Projet de fin de cycle, ESTM Dakar, Licence Téléinformatique GLAR, 2025-2026.</p>
      <nav aria-label="Informations légales">
        <Link to="/mentions-legales">Mentions légales</Link>
        <Link to="/confidentialite">Confidentialité</Link>
        <Link to="/cgu">Conditions d'utilisation</Link>
        <button type="button" className="lien-bouton" onClick={rouvrir}>Gérer mes choix</button>
      </nav>
    </footer>
  );
}

/** Page publique à contenu long. Elle recouvre l'application, que l'on soit connecté ou non. */
function Coque({ titre, retour, children }: { titre: string; retour: ReactNode; children: ReactNode }) {
  return (
    <div className="auth auth-legal">
      <div className="auth-in">
        <header className="auth-haut">
          <Link to="/" className="logo auth-logo">Retrouv<span>ID</span></Link>
        </header>
        <main id="contenu" className="legal carte">
          <h1>{titre}</h1>
          <p className="muted petit">Dernière mise à jour : {MAJ}</p>
          {children}
          <p className="legal-retour">{retour}</p>
        </main>
        <PiedSite />
      </div>
    </div>
  );
}
const Retour = <Link className="btn p" to="/">Retour à l'accueil</Link>;

export function MentionsLegales() {
  return (
    <Coque titre="Mentions légales" retour={Retour}>
      <h2>Éditeur</h2>
      <p>RetrouvID est un projet de fin de cycle réalisé par Papa Dial SENE, étudiant en Licence Téléinformatique (parcours GLAR) à l'ESTM, École supérieure de technologie et de management, à Dakar, sous la direction du Dr El Hadji Bassirou TOURÉ. Il n'est pas exploité par une société et ne poursuit aucun but commercial.</p>
      <h2>Nature du service</h2>
      <p>L'application est un prototype pédagogique. Le paiement de 1 000 FCFA demandé pour obtenir des coordonnées passe par PayDunya (Wave, Orange Money) ; en mode test, aucun argent n'est prélevé. Les e-mails de notification sont écrits dans le journal du serveur et ne sont pas envoyés.</p>
      <h2>Contact</h2>
      <p>Le moyen de contact est le formulaire de la <Link to="/#contact">page d'accueil</Link>. Le message arrive chez l'administrateur de la plateforme.</p>
      <h2>Hébergement</h2>
      <p>Aucun hébergement de production n'est en service. L'hébergeur sera nommé ici à la mise en ligne.</p>
      <h2>Services tiers</h2>
      <p>Les cartes et la recherche d'adresse viennent d'OpenStreetMap : le serveur de RetrouvID interroge Nominatim, et l'affichage d'une carte transmet votre adresse IP à OpenStreetMap. Les polices de caractères sont servies par l'application elle-même, sans appel à un service extérieur. Si la connexion avec Google est activée, le script d'identité de Google est chargé sur les écrans de connexion et d'inscription.</p>
      <h2>Propriété</h2>
      <p>Le code, les textes et les maquettes sont l'œuvre de l'éditeur. Le fond d'illustration de l'application est une image décorative sans valeur de document officiel : aucune pièce d'identité réelle n'y figure.</p>
    </Coque>
  );
}

export function Confidentialite() {
  const { rouvrir } = useConsentement();
  return (
    <Coque titre="Politique de confidentialité" retour={Retour}>
      <h2>Qui traite vos données</h2>
      <p>Papa Dial SENE, étudiant à l'ESTM Dakar, dans le cadre de son projet de fin de cycle (voir les <Link to="/mentions-legales">mentions légales</Link>). Le traitement relève de la loi n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère personnel, dont le respect est contrôlé par la Commission de protection des données personnelles (CDP). Avant toute mise en service réelle, il devra être déclaré à la CDP.</p>

      <h2>Ce que nous collectons, et pourquoi</h2>
      <p><b>Votre compte.</b> Prénom, nom, adresse e-mail, téléphone et mot de passe, que nous ne conservons que haché. Ces données servent à vous identifier et à vous joindre. Votre téléphone et votre e-mail ne sont transmis à l'autre personne qu'après la vérification d'un agent, votre confirmation et le paiement.</p>
      <p><b>Vos déclarations et signalements.</b> Type de document, numéro, nom, date de naissance si vous la donnez, lieu et date, description, photo facultative et position GPS facultative. Ces données servent à rapprocher une perte d'un document trouvé. Le numéro et le nom d'un document trouvé ne sont jamais montrés au propriétaire ; l'agent ne les lit que partiellement masqués.</p>
      <p><b>Votre paiement.</b> Nous gardons le montant, la date, l'état et la référence de la transaction. Le numéro Wave ou Orange Money que vous saisissez reste chez PayDunya et son opérateur : RetrouvID ne le voit pas.</p>
      <p><b>Vos échanges.</b> Les messages de la discussion, ouverte seulement après le paiement, et ceux que vous envoyez par le formulaire de contact.</p>
      <p><b>Le journal des actions.</b> Les actions sensibles (inscription, validation, ouverture d'un dossier par un administrateur, clôture) sont inscrites avec la date et le compte concerné. Le contenu des messages n'y figure jamais.</p>

      <h2>Qui voit quoi</h2>
      <p>L'agent de correspondance voit des valeurs masquées en partie, la distance entre les deux lieux et la photo. L'administrateur peut ouvrir le détail complet d'un dossier ; chaque ouverture est journalisée. L'autre personne ne reçoit vos coordonnées qu'à la fin du parcours de vérification.</p>

      <h2>Combien de temps</h2>
      <p>À la clôture d'un dossier, le numéro, le nom, la date de naissance, la description, la photo et les messages sont effacés, et les positions GPS sont remises à zéro. Le compte et le journal sont conservés. Le prototype n'applique pas encore de durée maximale automatique pour un compte inactif : elle sera fixée avant toute mise en service.</p>

      <h2>Vos droits</h2>
      <p>Vous pouvez consulter et corriger vos informations dans votre profil (une fois connecté), corriger ou supprimer une déclaration ou un signalement tant qu'aucun rapprochement n'est en cours, et demander l'effacement de votre compte ou vous opposer à un traitement par le formulaire de la <Link to="/#contact">page d'accueil</Link>. L'administrateur traite la demande. Vous pouvez aussi saisir la CDP.</p>

      <h2 id="stockage">Ce que nous gardons sur votre appareil</h2>
      <p>Trois éléments, tous nécessaires au fonctionnement : le jeton de votre session (valable 8 heures), votre choix de thème clair ou sombre, et votre choix concernant la mesure d'audience. Il n'y a pas de cookie publicitaire. Une mesure d'audience des pages publiques (accueil, aide, pages légales) peut être activée par l'éditeur ; elle ne démarre qu'avec votre accord, avec anonymisation de l'adresse IP, et ne lit jamais l'espace connecté.</p>
      <p><button type="button" className="btn s" onClick={rouvrir}>Modifier mon choix</button></p>

      <h2>Sécurité</h2>
      <p>Mots de passe hachés avec bcrypt, session signée de 8 heures, nombre de tentatives de connexion limité, masquage des valeurs sensibles, photo accessible seulement aux personnes autorisées. En production, tout le trafic est redirigé vers HTTPS.</p>

      <h2>Services tiers</h2>
      <p>PayDunya (paiement par Wave et Orange Money : vous quittez RetrouvID le temps du paiement), OpenStreetMap (cartes et adresses) et, si elle est activée, la connexion avec Google. Ces services voient votre adresse IP lorsque vous les utilisez. La position GPS n'est lue qu'au moment où vous appuyez sur « Utiliser ma position actuelle ».</p>
    </Coque>
  );
}

export function Cgu() {
  return (
    <Coque titre="Conditions d'utilisation" retour={Retour}>
      <h2>1. Objet</h2>
      <p>RetrouvID aide une personne qui a perdu une carte d'identité, un permis de conduire ou un passeport à le récupérer auprès de la personne qui l'a trouvé. La plateforme met les deux en relation après vérification ; elle ne conserve ni ne remet aucun document.</p>
      <h2>2. Compte</h2>
      <p>Un seul compte suffit pour déclarer une perte et pour signaler un document trouvé. Les informations données à l'inscription doivent être exactes, en particulier l'adresse e-mail et le téléphone, car ce sont eux que l'autre personne recevra. Vous êtes responsable de la confidentialité de votre mot de passe.</p>
      <h2>3. Règles d'usage</h2>
      <p>Vous ne déclarez que votre propre document, ou celui d'un proche avec son accord. Vous ne signalez qu'un document réellement trouvé. Les fausses déclarations, l'usurpation d'identité, la collecte de données sur d'autres personnes et l'envoi de messages abusifs sont interdits.</p>
      <h2>4. Vérification par un agent</h2>
      <p>Quand une déclaration ressemble à un signalement, un agent compare des valeurs partiellement masquées. Il valide ou il écarte la correspondance. Sa décision n'est pas une garantie que le document soit le vôtre : c'est à vous de le confirmer.</p>
      <h2>5. Coordonnées et paiement</h2>
      <p>Déclarer et signaler sont gratuits. Pour recevoir les coordonnées de la personne qui a trouvé le document, le propriétaire règle 1 000 FCFA par Wave ou Orange Money, une fois la correspondance validée par l'agent puis confirmée par lui. Le paiement est traité par PayDunya sur sa propre page : RetrouvID ne reçoit ni votre numéro de paiement ni votre code secret, seulement la confirmation que la somme a été réglée. Les coordonnées ne sont affichées qu'après cette confirmation. Si le paiement échoue ou est annulé, vous pouvez réessayer sans frais.</p>
      <h2>6. Remise du document</h2>
      <p>La remise se fait entre les deux personnes, qui conviennent du lieu et de l'heure dans la discussion. Chacune confirme ensuite la remise sur la plateforme. Prenez les précautions d'usage : un lieu public, de jour, et la vérification d'une pièce d'identité à l'échange. RetrouvID n'est pas partie à la remise et n'en répond pas.</p>
      <h2>7. Retrait et suspension</h2>
      <p>Un administrateur peut retirer un contenu manifestement frauduleux ou suspendre un compte, avec un motif consigné au journal.</p>
      <h2>8. Données personnelles</h2>
      <p>Le traitement de vos données est décrit dans la <Link to="/confidentialite">politique de confidentialité</Link>.</p>
      <h2>9. Responsabilité</h2>
      <p>Le service est un prototype fourni tel quel, sans garantie de disponibilité ni de résultat. Il ne remplace pas la déclaration de perte auprès de la police ou de la gendarmerie, ni la demande de duplicata.</p>
      <h2>10. Évolution et droit applicable</h2>
      <p>Ces conditions peuvent changer ; la date de mise à jour figure en haut de la page. Elles relèvent du droit sénégalais.</p>
    </Coque>
  );
}

export function Introuvable({ retour }: { retour: string }) {
  return (
    <div className="auth auth-legal">
      <div className="auth-in">
        <header className="auth-haut"><Link to="/" className="logo auth-logo">Retrouv<span>ID</span></Link></header>
        <main id="contenu" className="legal carte introuvable">
          <p className="code-404" aria-hidden="true">404</p>
          <h1>Cette page n'existe pas</h1>
          <p>L'adresse est peut-être mal saisie, ou la page a été déplacée. Vos déclarations et vos signalements n'ont pas bougé.</p>
          <p className="legal-retour"><Link className="btn p" to="/">{retour}</Link></p>
        </main>
      </div>
    </div>
  );
}
