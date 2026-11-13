-- Position GPS facultative du lieu de perte et du lieu de découverte
ALTER TABLE declarations ADD COLUMN lat double precision, ADD COLUMN lng double precision;
ALTER TABLE declarations ADD CONSTRAINT declarations_position_ck CHECK ((lat IS NULL) = (lng IS NULL) AND (lat IS NULL OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)));
ALTER TABLE signalements ADD COLUMN lat double precision, ADD COLUMN lng double precision;
ALTER TABLE signalements ADD CONSTRAINT signalements_position_ck CHECK ((lat IS NULL) = (lng IS NULL) AND (lat IS NULL OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)));

-- Discussion entre les deux parties, ouverte seulement après le paiement
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correspondance_id uuid NOT NULL REFERENCES correspondances(id),
  auteur_id uuid NOT NULL REFERENCES comptes(id),
  texte text NOT NULL CHECK (char_length(texte) BETWEEN 1 AND 500),
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_correspondance_idx ON messages (correspondance_id, cree_le);

-- Messages du centre d'aide (formulaire de contact)
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  email text NOT NULL,
  sujet text NOT NULL,
  message text NOT NULL CHECK (char_length(message) <= 1000),
  traite boolean NOT NULL DEFAULT false,
  cree_le timestamptz NOT NULL DEFAULT now()
);
