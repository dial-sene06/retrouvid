-- Une déclaration (perte ou document trouvé) ne peut être corrigée que deux fois par son auteur.
ALTER TABLE declarations ADD COLUMN IF NOT EXISTS nb_modifications integer NOT NULL DEFAULT 0;
ALTER TABLE signalements ADD COLUMN IF NOT EXISTS nb_modifications integer NOT NULL DEFAULT 0;
