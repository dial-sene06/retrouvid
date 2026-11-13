-- Vérification du numéro de téléphone par un code à 6 chiffres (SMS simulé), avant la création d'un compte
-- et à chaque connexion. Le code n'est jamais stocké en clair. Pour une inscription, les informations du futur
-- compte attendent dans « charge » et sont effacées dès que le code est utilisé.
CREATE TABLE IF NOT EXISTS verifications_telephone (
  id          uuid PRIMARY KEY,
  objet       text NOT NULL CHECK (objet IN ('inscription','connexion')),
  compte_id   uuid REFERENCES comptes(id) ON DELETE CASCADE,
  telephone   text NOT NULL,
  code_hache  text NOT NULL,
  charge      jsonb,
  tentatives  integer NOT NULL DEFAULT 0,
  envois      integer NOT NULL DEFAULT 1,
  expire_le   timestamptz NOT NULL,
  utilisee_le timestamptz,
  cree_le     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verifications_telephone_expire_idx ON verifications_telephone (expire_le);
