-- Photo facultative d'un document trouvé. Table séparée pour ne jamais charger l'image avec les listes de dossiers.
CREATE TABLE signalement_photos (
  signalement_id uuid PRIMARY KEY REFERENCES signalements(id) ON DELETE CASCADE,
  type_mime text NOT NULL CHECK (type_mime IN ('image/jpeg','image/png','image/webp')),
  donnees bytea NOT NULL CHECK (octet_length(donnees) <= 2097152),
  cree_le timestamptz NOT NULL DEFAULT now()
);
