export const config = {
  databaseUrl: () => process.env.DATABASE_URL ?? 'postgres://retrouvid:retrouvid_dev@localhost:5432/retrouvid',
  jwtSecret: () => {
    const s = process.env.JWT_SECRET;
    if (!s || s.length < 16) throw new Error('JWT_SECRET manquant ou trop court (16 caractères minimum)');
    return s;
  },
  port: () => Number(process.env.PORT ?? 3000),
  corsOrigin: () => (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
  limiteAuth: Number(process.env.AUTH_LIMIT ?? 10),
  googleClientId: () => process.env.GOOGLE_CLIENT_ID || '',
  geocodeurUrl: () => process.env.GEOCODE_URL ?? 'https://nominatim.openstreetmap.org',
  geocodeurPauseMs: () => Number(process.env.GEOCODE_PAUSE_MS ?? 1000),
  geocodeurPays: () => process.env.GEOCODE_PAYS ?? 'sn',
  /** En production derrière un proxy TLS : FORCE_HTTPS=true redirige tout le trafic http vers https. */
  forceHttps: () => process.env.FORCE_HTTPS === 'true',
  montantCoordonnees: 1000,
  verifTelephone: {
    /** Code par SMS avant l'inscription et à chaque connexion. VERIF_TELEPHONE=non la coupe (tests, dépannage). */
    active: () => process.env.VERIF_TELEPHONE !== 'non',
    /** SMS simulé : aucun envoi réel, le code est écrit dans le journal du serveur et renvoyé à l'écran. */
    simulation: () => (process.env.SMS_MODE ?? 'simulation') === 'simulation',
    dureeMinutes: 10,
    tentativesMax: 5,
    envoisMax: 3,
  },
  /** Code de vérification par e-mail, envoyé par Brevo. Sans clé ni expéditeur, l'option e-mail n'est pas proposée. */
  email: {
    cleBrevo: () => process.env.BREVO_API_KEY ?? '',
    /**
     * Envoi direct par un serveur SMTP, Gmail par défaut : SMTP_UTILISATEUR est l'adresse Gmail, SMTP_MOT_DE_PASSE un
     * « mot de passe d'application » Google (16 caractères, jamais le mot de passe du compte).
     */
    smtp: {
      hote: () => process.env.SMTP_HOTE || 'smtp.gmail.com',
      port: () => Number(process.env.SMTP_PORT || 465),
      utilisateur: () => process.env.SMTP_UTILISATEUR ?? '',
      motDePasse: () => (process.env.SMTP_MOT_DE_PASSE ?? '').replace(/\s/g, ''),
      configure: () => !!(process.env.SMTP_UTILISATEUR && process.env.SMTP_MOT_DE_PASSE),
    },
    /** Adresse d'expédition : celle validée dans Brevo, ou par défaut l'adresse Gmail utilisée en SMTP. */
    expediteur: () => process.env.EMAIL_EXPEDITEUR || process.env.SMTP_UTILISATEUR || '',
    nomExpediteur: () => process.env.EMAIL_NOM_EXPEDITEUR ?? 'RetrouvID',
    configure: () => !!(process.env.SMTP_UTILISATEUR && process.env.SMTP_MOT_DE_PASSE) || !!(process.env.BREVO_API_KEY && process.env.EMAIL_EXPEDITEUR),
  },
  /** Adresse publique de la PWA : c'est là que PayDunya renvoie l'utilisateur après le paiement. */
  urlApplication: () => (process.env.APP_URL ?? process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:5173').replace(/\/$/, ''),
  /** Adresse publique de l'API (https) : PayDunya y envoie sa notification de paiement. Vide en local. */
  urlApiPublique: () => (process.env.API_PUBLIC_URL ?? '').replace(/\/$/, ''),
  paydunya: {
    cleMaitre: () => process.env.PAYDUNYA_MASTER_KEY ?? '',
    clePrivee: () => process.env.PAYDUNYA_PRIVATE_KEY ?? '',
    jeton: () => process.env.PAYDUNYA_TOKEN ?? '',
    /** « test » appelle le bac à sable de PayDunya, « live » encaisse pour de vrai. */
    mode: (): 'test' | 'live' => (process.env.PAYDUNYA_MODE === 'live' ? 'live' : 'test'),
    canaux: () => (process.env.PAYDUNYA_CANAUX ?? 'wave-senegal,orange-money-senegal').split(',').map((c) => c.trim()).filter(Boolean),
    configure: () => !!(process.env.PAYDUNYA_MASTER_KEY && process.env.PAYDUNYA_PRIVATE_KEY && process.env.PAYDUNYA_TOKEN),
  },
};
